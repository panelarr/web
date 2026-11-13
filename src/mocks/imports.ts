// SPDX-License-Identifier: GPL-3.0-or-later

// Imports from another app's backup, as the server keeps them: per user, matched in the
// background a few series at a time with `import.progress` and then `import.finished`, then
// applied the same way. The mock can't read a backup: any gzip file is "a backup" holding the
// same made-up library.
import { HttpResponse } from "msw";
import type { components } from "@/api/schema.gen";
import { CATALOG, withinCeiling } from "./catalog";
import { commit, db, type MockDb, newId } from "./db";
import { emit } from "./events";
import { type MockOperation, op, problem } from "./op";

type S = components["schemas"];

/** An import and whose it is, with every series' final outcome (shown once the preview reaches it). */
export interface MockImport {
  user_id: string;
  sha256: string;
  import: S["Import"];
  items: S["ImportItem"][];
  /** Whether its preview finished: only then can it be applied (or resumed). */
  previewed: boolean;
  /** Series apply has gone through, in the backup's order: a resumed apply goes on from here. */
  applied: number;
}

/** What the mock needs from the rest of the mock server (set by `importOperations`). */
export interface ImportDeps {
  addToLibrary: (user: S["User"], entryId: string) => { created: boolean; workId: string } | undefined;
}
let deps: ImportDeps | undefined;

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
/** The most imports a user keeps, as the server's cap. */
export const MAX_IMPORTS = 20;
/** Series the mock's preview matches per tick (a tick is a second in the browser). */
const PER_TICK = 12;
/** Series the mock's apply goes through per tick: slower, so there's time to cancel. */
const APPLY_PER_TICK = 5;
/** Last-read times in the future the mock's apply caps, once. */
const CLAMPED = 2;

/** The server's messages for a series apply kept something for. */
export const WHY_MAY_NOT_ATTACH =
  "reading imported; the series isn't attached: your account may not add works or fix matches, so chapters are placed by number";
const WHY_KEPT_OTHER = "kept the series already attached on this source; chapters are placed by number";

const TITLES = [
  "Harbor Lights",
  "Pocket Knight",
  "The Cartographer's Daughter",
  "Snowfall Arcade",
  "Brass Lungs",
  "Kitchen Witch Diaries",
  "Seventh Lighthouse",
  "Moth and Lantern",
  "Paper Moon Cafe",
  "Thunderhead Valley",
  "Velvet Tide",
  "Ash Garden",
  "The Tin Astronomer",
  "Fox Lane Apartments",
  "Hollow Bell",
  "Saltwind Couriers",
];
const PEOPLE = ["Mina Kurosawa", "Ito Hanabusa", "Yuna Seo", "Lin Qiao", "Rafael Ortega"];
/** Made-up sources, as named in the backup (no language). */
const SOURCES = [
  { compat: "mihon:1001", name: "Example Source", id: "example:1001" },
  { compat: "mihon:1002", name: "Sample Scans", id: "example:1002" },
];
const MISSING_SOURCE = { compat: "mihon:3101", name: "Lantern Reader" };
const OTHER_MISSING = { compat: "mihon:9001", name: "Old Mirror" };
const CATEGORIES: S["ImportCategory"][] = [
  { name: "Reading", series: 22 },
  { name: "Plan to read", series: 11 },
  { name: "Favourites", series: 4 },
];

/** How many series of the made-up backup end up with each outcome, in its order. */
const PLAN: ReadonlyArray<[S["ImportOutcome"], number]> = [
  ["ready", 30],
  ["in_library", 3],
  ["needs_choice", 2],
  ["not_found", 2],
  ["source_missing", 4],
  ["not_allowed", 1],
];

function title(i: number): string {
  const base = TITLES[i % TITLES.length] as string;
  const round = Math.floor(i / TITLES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

/** The made-up backup's series. Fixed dates and numbers only, so nothing depends on today. */
export function backupItems(): S["ImportItem"][] {
  const outcomes = PLAN.flatMap(([outcome, n]) => Array.from({ length: n }, () => outcome));
  return outcomes.map((outcome, idx) => {
    const missing = outcome === "source_missing" || outcome === "not_found";
    const known = SOURCES[idx % SOURCES.length] as (typeof SOURCES)[number];
    const source = missing ? (idx % 4 === 3 ? OTHER_MISSING : MISSING_SOURCE) : known;
    const chaptersRead = (idx * 7) % 40;
    const bookmarks = idx % 5 === 0 ? 2 : 0;
    const item: S["ImportItem"] = {
      idx,
      title: title(idx),
      author: PEOPLE[idx % PEOPLE.length] as string,
      artist: PEOPLE[(idx + 2) % PEOPLE.length] as string,
      source_name: source.name,
      source_compat_id: source.compat,
      series_key: `/series/${4000 + idx}`,
      added_at: `2025-0${(idx % 9) + 1}-1${idx % 10}T08:00:00Z`,
      categories: [(CATEGORIES[idx % CATEGORIES.length] as S["ImportCategory"]).name],
      outcome,
      candidates: [],
      chapters: chaptersRead + bookmarks + (idx % 3 === 0 ? 1 : 0),
      chapters_read: chaptersRead,
      bookmarks,
      placed: 0,
      unplaced: 0,
      pending: 0,
    };
    if (outcome === "ready" || outcome === "in_library") {
      item.entry_id = `ent_${1000 + (idx % 24)}`;
      item.source_id = known.id;
    }
    if (outcome === "source_missing") item.entry_id = `ent_${1000 + (idx % 24)}`;
    if (outcome === "in_library") item.work_id = `0f3c5d2e-7a10-4b6c-9d1e-${String(100000000000 + idx)}`;
    if (outcome === "needs_choice") {
      item.candidates = [
        { entry_id: "ent_1003", title: "Paper Kites Over Harbor Town", year: 2015, score: 0.82, authors_match: false },
        { entry_id: "ent_1014", title: "Glass Sea", year: 2012, score: 0.64, matched_title: "Glass Sea" },
      ];
    }
    if (outcome === "not_allowed") item.message = "This work is above your content rating limit.";
    return item;
  });
}

function summaryOf(items: S["ImportItem"][]): S["ImportSummary"] {
  const sum = (pick: (item: S["ImportItem"]) => number) => items.reduce((n, item) => n + pick(item), 0);
  return {
    series: items.length,
    out_of_library: 0,
    chapters: sum((item) => item.chapters_read + 12),
    chapters_read: sum((item) => item.chapters_read),
    in_progress: sum((item) => (item.idx % 3 === 0 ? 1 : 0)),
    bookmarks: sum((item) => item.bookmarks),
    history: sum((item) => Math.min(item.chapters_read, 10)),
    tracker_links: 5,
    categories: structuredClone(CATEGORIES),
    package_hints: [],
  };
}

/** Packages that would provide missing sources: known once the preview is done. */
function packageHints(items: S["ImportItem"][]): S["ImportPackageHint"][] {
  const series = items.filter(
    (item) =>
      item.source_compat_id === MISSING_SOURCE.compat &&
      (item.outcome === "source_missing" || item.outcome === "not_found"),
  ).length;
  return series > 0
    ? [{ plugin_id: "stores", package_id: "org.example.lantern", package_name: "Lantern Reader", series }]
    : [];
}

/** The series the preview has reached show their outcome; the rest are pending. */
function visibleItem(found: MockImport, item: S["ImportItem"]): S["ImportItem"] {
  if (found.previewed || item.idx < found.import.progress.done) return item;
  const { entry_id: _e, work_id: _w, source_id: _s, message: _m, result: _r, ...rest } = item;
  return { ...rest, outcome: "pending", candidates: [] };
}

function outcomesOf(found: MockImport): S["ImportOutcomeCount"][] {
  const counts = new Map<S["ImportOutcome"], S["ImportOutcomeCount"]>();
  for (const raw of found.items) {
    const item = visibleItem(found, raw);
    const count = counts.get(item.outcome) ?? { outcome: item.outcome, series: 0, chapters_read: 0, bookmarks: 0 };
    count.series += 1;
    count.chapters_read += item.chapters_read;
    count.bookmarks += item.bookmarks;
    counts.set(item.outcome, count);
  }
  return [...counts.values()];
}

function resultsOf(found: MockImport): S["ImportResultCount"][] {
  const counts = new Map<S["ImportResult"], number>();
  for (const item of found.items) if (item.result) counts.set(item.result, (counts.get(item.result) ?? 0) + 1);
  return [...counts].map(([result, series]) => ({ result, series }));
}

function view(found: MockImport): S["Import"] {
  return { ...found.import, outcomes: outcomesOf(found), results: resultsOf(found) };
}

export function importsOf(d: MockDb, userId: string): MockImport[] {
  d.imports ??= [];
  return d.imports.filter((i) => i.user_id === userId);
}

const RUNNING: S["ImportState"][] = ["previewing", "applying"];

/** Moves every preview and apply on by a few series, with events as the server sends them. */
export function tickImports(d: MockDb): boolean {
  let changed = false;
  for (const found of d.imports ?? []) {
    const imp = found.import;
    if (imp.state === "previewing") {
      imp.progress = { ...imp.progress, done: Math.min(imp.progress.total, imp.progress.done + PER_TICK) };
      changed = true;
      emit("import.progress", { import_id: imp.id, done: imp.progress.done, total: imp.progress.total });
      if (imp.progress.done >= imp.progress.total) {
        found.previewed = true;
        imp.state = "preview";
        imp.finished_at = new Date().toISOString();
        imp.summary = { ...imp.summary, package_hints: packageHints(found.items) };
        emit("import.finished", { import_id: imp.id, state: imp.state });
      }
    } else if (imp.state === "applying") {
      const user = d.users.find((u) => u.id === found.user_id);
      const end = Math.min(found.items.length, found.applied + APPLY_PER_TICK);
      for (; found.applied < end; found.applied++) {
        const item = found.items[found.applied];
        if (user && item) applyItem(d, found, user, item);
      }
      imp.progress = { done: found.applied, total: found.items.length };
      changed = true;
      emit("import.progress", { import_id: imp.id, done: imp.progress.done, total: imp.progress.total });
      if (found.applied >= found.items.length) {
        imp.state = "done";
        imp.finished_at = new Date().toISOString();
        emit("import.finished", { import_id: imp.id, state: imp.state });
      }
    }
  }
  return changed;
}

/** The user's series some import of theirs applied already (by source and series key). */
function importedKey(userId: string, item: S["ImportItem"]): string {
  return `${userId}|${item.source_compat_id}|${item.series_key}`;
}

/**
 * Applies one series as the server does: series with a work go into the library (a new entry
 * keeps the backup's added date) and get their reading; a series applied before by any of the
 * user's imports is `already_imported`. Series that need a choice, weren't found or aren't
 * allowed are left as they are.
 */
function applyItem(d: MockDb, found: MockImport, user: S["User"], item: S["ImportItem"]): void {
  if (item.result) return;
  if (!item.entry_id || !["ready", "in_library", "source_missing"].includes(item.outcome)) return;
  d.importedSeries ??= [];
  const key = importedKey(user.id, item);
  const added = deps?.addToLibrary(user, item.entry_id);
  if (added?.created && item.added_at) {
    const entry = d.library.find((e) => e.user_id === user.id && e.work_id === added.workId);
    if (entry) entry.added_at = item.added_at;
  }
  if (added) item.work_id = added.workId;
  item.applied_at = new Date().toISOString();
  if (d.importedSeries.includes(key)) {
    item.result = "already_imported";
    return;
  }
  d.importedSeries.push(key);
  item.result = "applied";
  // A newly attached series' chapters come after its first check; some marks name no chapter.
  item.pending = item.outcome === "ready" && item.idx % 6 === 1 ? 2 : 0;
  item.unplaced = item.idx % 10 === 7 ? 1 : 0;
  item.placed = Math.max(0, item.chapters - item.pending - item.unplaced);
  const mayAttach = user.role === "admin" || user.grants.may_add || user.grants.may_manage_matches;
  const messages = [
    item.source_id && !mayAttach ? WHY_MAY_NOT_ATTACH : "",
    item.outcome === "ready" && item.idx === 4 ? WHY_KEPT_OTHER : "",
    item.unplaced > 0 ? `${item.unplaced} chapters couldn't be placed: Panelarr has no such chapters` : "",
  ].filter(Boolean);
  if (messages.length > 0) item.message = messages.join("; ");
  if (!found.import.summary.clamped_times) found.import.summary = { ...found.import.summary, clamped_times: CLAMPED };
}

/** A finished preview of the made-up backup for `userId`, for tests and seeded states. */
export function seedImport(d: MockDb, userId: string, createdAt = "2026-11-01T10:00:00Z"): S["Import"] {
  const items = backupItems();
  const found: MockImport = {
    user_id: userId,
    sha256: newId(),
    items,
    previewed: true,
    applied: 0,
    import: {
      id: newId(),
      format: "mihon_backup",
      state: "preview",
      created_at: createdAt,
      finished_at: createdAt,
      progress: { done: items.length, total: items.length },
      summary: { ...summaryOf(items), package_hints: packageHints(items) },
      outcomes: [],
      results: [],
    },
  };
  d.imports ??= [];
  d.imports.unshift(found);
  commit();
  return view(found);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What the server does with an uploaded file's bytes. Component tests call it directly:
 * jsdom's files lose their bytes on the way through Node's fetch.
 */
export async function receiveBackup(user: S["User"], bytes: Uint8Array): Promise<Response> {
  if (bytes.length > MAX_BACKUP_BYTES) {
    return problem(413, "too_large", "Too large", "A backup can be at most 64 MiB.");
  }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return problem(422, "bad_backup", "Not a backup", "The file isn't gzip: is it a .tachibk backup?");
  }
  const d = db();
  const sha = await sha256(bytes);
  const mineAll = importsOf(d, user.id);
  const same = mineAll.find((i) => i.sha256 === sha && i.import.state !== "failed" && i.import.state !== "cancelled");
  if (same) return HttpResponse.json(view(same), { status: 200 });
  if (mineAll.length >= MAX_IMPORTS) {
    return problem(
      409,
      "too_many_imports",
      "Too many imports",
      `you keep ${MAX_IMPORTS} imports already: delete one first`,
    );
  }
  if (mineAll.some((i) => RUNNING.includes(i.import.state))) {
    return problem(409, "import_running", "An import is running", "Another import of yours is running.");
  }
  const items = backupItems();
  const found: MockImport = {
    user_id: user.id,
    sha256: sha,
    items,
    previewed: false,
    applied: 0,
    import: {
      id: newId(),
      format: "mihon_backup",
      state: "previewing",
      created_at: new Date().toISOString(),
      progress: { done: 0, total: items.length },
      summary: summaryOf(items),
      outcomes: [],
      results: [],
    },
  };
  d.imports.unshift(found);
  commit();
  return HttpResponse.json(view(found), { status: 202 });
}

/** The 400 the server answers for an entry the user may not see. */
function noSuchEntry(): Response {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "Invalid request",
      status: 400,
      code: "invalid_request",
      detail: "entry_id: no such catalogue entry",
      errors: [{ field: "entry_id", message: "no such catalogue entry" }],
    },
    { status: 400, headers: { "Content-Type": "application/problem+json" } },
  );
}

/**
 * Sets the work of a series by hand, or skips it, as the server does: the choice waits for
 * apply, or is applied at once when the import was applied already.
 */
function resolveItem(found: MockImport, user: S["User"], idx: number, body: S["ImportResolve"]): Response {
  const imp = found.import;
  if (RUNNING.includes(imp.state)) {
    return problem(
      409,
      "import_running",
      "An import is running",
      "an import of yours is running: wait for it, cancel it or delete it",
    );
  }
  const item = found.items[idx];
  if (!item || !found.previewed) return problem(404, "not_found", "Not found", "no such series in the import");
  const itemState = () =>
    problem(409, "import_item_state", "Not in that state", "the series can't be resolved that way in its state");
  if (body.skip) {
    if (item.result) return itemState();
    item.result = "skipped";
    commit();
    return HttpResponse.json(item);
  }
  if (!(item.result === "skipped" || (!item.result && ["needs_choice", "not_found"].includes(item.outcome)))) {
    return itemState();
  }
  const entry = CATALOG.find((e) => e.id === body.entry_id);
  if (!entry || !withinCeiling(entry.content_rating, user.grants.content_rating_ceiling)) return noSuchEntry();
  const d = db();
  const work = d.works.find((w) => w.entry_id === entry.id);
  const inLibrary = !!work && d.library.some((e) => e.user_id === user.id && e.work_id === work.id);
  const source = SOURCES.find((s) => s.compat === item.source_compat_id);
  if (!inLibrary && user.role !== "admin" && !user.grants.may_add) {
    return problem(422, "not_allowed", "Not allowed", "your account may not add works");
  }
  delete item.result;
  item.entry_id = entry.id;
  if (work) item.work_id = work.id;
  item.outcome = inLibrary ? "in_library" : source ? "ready" : "source_missing";
  if (source) item.source_id = source.id;
  if (imp.state !== "preview") applyItem(d, found, user, item);
  commit();
  return HttpResponse.json(item);
}

export function importOperations(requireUser: () => S["User"] | Response, given: ImportDeps): MockOperation[] {
  deps = given;
  const mine = (id: unknown) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = importsOf(db(), user.id).find((i) => i.import.id === id);
    return found ?? problem(404, "not_found", "Not found", "No such import.");
  };
  return [
    op("get", "/me/imports", ({ request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const url = new URL(request.url);
      const all = importsOf(db(), user.id)
        .map(view)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const size = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? 50), 1), 200);
      const offset = Number(url.searchParams.get("page_token") || 0);
      const next = offset + size < all.length ? String(offset + size) : "";
      return HttpResponse.json({
        imports: all.slice(offset, offset + size),
        next_page_token: next,
      } satisfies S["ImportList"]);
    }),
    op("post", "/me/imports", async ({ request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BACKUP_BYTES) {
        return problem(413, "too_large", "Too large", "A backup can be at most 64 MiB.");
      }
      let file: FormDataEntryValue | null = null;
      try {
        file = (await request.formData()).get("file");
      } catch {
        file = null;
      }
      if (file === null || typeof file === "string") {
        return problem(400, "invalid_request", "Invalid request", "file: required");
      }
      return receiveBackup(user, new Uint8Array(await file.arrayBuffer()));
    }),
    op("get", "/me/imports/{id}", ({ params }) => {
      const found = mine(params.id);
      return found instanceof Response ? found : HttpResponse.json(view(found));
    }),
    op("delete", "/me/imports/{id}", ({ params }) => {
      const found = mine(params.id);
      if (found instanceof Response) return found;
      const d = db();
      d.imports = d.imports.filter((i) => i !== found);
      commit();
      return new HttpResponse(null, { status: 204 });
    }),
    op("get", "/me/imports/{id}/items", ({ params, request }) => {
      const found = mine(params.id);
      if (found instanceof Response) return found;
      const url = new URL(request.url);
      const outcome = url.searchParams.get("outcome");
      const result = url.searchParams.get("result");
      const list = found.items
        .map((item) => visibleItem(found, item))
        .filter((item) => !outcome || item.outcome === outcome)
        .filter((item) => !result || item.result === result);
      const size = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? 50), 1), 200);
      const offset = Number(url.searchParams.get("page_token") || 0);
      const next = offset + size < list.length ? String(offset + size) : "";
      return HttpResponse.json({
        items: list.slice(offset, offset + size),
        next_page_token: next,
      } satisfies S["ImportItemPage"]);
    }),
    op("post", "/me/imports/{id}/apply", ({ params }) => {
      const found = mine(params.id);
      if (found instanceof Response) return found;
      const imp = found.import;
      const resumable = (imp.state === "cancelled" || imp.state === "failed") && found.previewed;
      if (imp.state !== "preview" && !resumable) {
        return problem(
          409,
          "import_state",
          "Not in that state",
          "only an import whose preview finished can be applied: in preview, or cancelled or failed after it",
        );
      }
      if (importsOf(db(), found.user_id).some((i) => i !== found && RUNNING.includes(i.import.state))) {
        return problem(
          409,
          "import_running",
          "An import is running",
          "an import of yours is running: wait for it, cancel it or delete it",
        );
      }
      imp.state = "applying";
      delete imp.finished_at;
      delete imp.message;
      imp.progress = { done: found.applied, total: found.items.length };
      commit();
      return HttpResponse.json(view(found), { status: 202 });
    }),
    op("post", "/me/imports/{id}/cancel", ({ params }) => {
      const found = mine(params.id);
      if (found instanceof Response) return found;
      const imp = found.import;
      if (!RUNNING.includes(imp.state)) {
        return problem(409, "import_not_running", "Not running", "the import isn't running");
      }
      imp.state = "cancelled";
      imp.finished_at = new Date().toISOString();
      emit("import.finished", { import_id: imp.id, state: imp.state });
      commit();
      return HttpResponse.json(view(found));
    }),
    op("post", "/me/imports/{id}/items/{idx}/resolve", async ({ params, request }) => {
      const found = mine(params.id);
      if (found instanceof Response) return found;
      const user = requireUser();
      if (user instanceof Response) return user;
      const body = (await request.json()) as S["ImportResolve"];
      if (!body.skip && !body.entry_id) {
        return problem(400, "invalid_request", "Invalid request", "entry_id or skip: required");
      }
      return resolveItem(found, user, Number(params.idx), body);
    }),
  ];
}
