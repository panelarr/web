// SPDX-License-Identifier: GPL-3.0-or-later

// Imports from another app's backup, as the server keeps them: per user, matched in the
// background a few series at a time with `import.progress` and then `import.finished`.
// The mock can't read a backup: any gzip file is "a backup" holding the same made-up library.
import { HttpResponse } from "msw";
import type { components } from "@/api/schema.gen";
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
}

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
/** Series the mock's preview matches per tick (a tick is a second in the browser). */
const PER_TICK = 12;

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
  if (item.idx < found.import.progress.done) return item;
  const { entry_id: _e, work_id: _w, source_id: _s, message: _m, ...rest } = item;
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

function view(found: MockImport): S["Import"] {
  return { ...found.import, outcomes: outcomesOf(found) };
}

export function importsOf(d: MockDb, userId: string): MockImport[] {
  d.imports ??= [];
  return d.imports.filter((i) => i.user_id === userId);
}

const RUNNING: S["ImportState"][] = ["previewing", "applying"];

/** Moves every preview on by a few series, with events as the server sends them. */
export function tickImports(d: MockDb): boolean {
  let changed = false;
  for (const found of d.imports ?? []) {
    const imp = found.import;
    if (imp.state !== "previewing") continue;
    imp.progress = { ...imp.progress, done: Math.min(imp.progress.total, imp.progress.done + PER_TICK) };
    changed = true;
    emit("import.progress", { import_id: imp.id, done: imp.progress.done, total: imp.progress.total });
    if (imp.progress.done >= imp.progress.total) {
      imp.state = "preview";
      imp.finished_at = new Date().toISOString();
      imp.summary = { ...imp.summary, package_hints: packageHints(found.items) };
      emit("import.finished", { import_id: imp.id, state: imp.state });
    }
  }
  return changed;
}

/** A finished preview of the made-up backup for `userId`, for tests and seeded states. */
export function seedImport(d: MockDb, userId: string, createdAt = "2026-11-01T10:00:00Z"): S["Import"] {
  const items = backupItems();
  const found: MockImport = {
    user_id: userId,
    sha256: newId(),
    items,
    import: {
      id: newId(),
      format: "mihon_backup",
      state: "preview",
      created_at: createdAt,
      finished_at: createdAt,
      progress: { done: items.length, total: items.length },
      summary: { ...summaryOf(items), package_hints: packageHints(items) },
      outcomes: [],
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
  if (mineAll.some((i) => RUNNING.includes(i.import.state))) {
    return problem(409, "import_running", "An import is running", "Another import of yours is running.");
  }
  const items = backupItems();
  const found: MockImport = {
    user_id: user.id,
    sha256: sha,
    items,
    import: {
      id: newId(),
      format: "mihon_backup",
      state: "previewing",
      created_at: new Date().toISOString(),
      progress: { done: 0, total: items.length },
      summary: summaryOf(items),
      outcomes: [],
    },
  };
  d.imports.unshift(found);
  commit();
  return HttpResponse.json(view(found), { status: 202 });
}

export function importOperations(requireUser: () => S["User"] | Response): MockOperation[] {
  const mine = (id: unknown) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = importsOf(db(), user.id).find((i) => i.import.id === id);
    return found ?? problem(404, "not_found", "Not found", "No such import.");
  };
  return [
    op("get", "/me/imports", () => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const list = importsOf(db(), user.id)
        .map(view)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 100);
      return HttpResponse.json({ imports: list } satisfies S["ImportList"]);
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
      const all = found.items.map((item) => visibleItem(found, item));
      const list = outcome ? all.filter((item) => item.outcome === outcome) : all;
      const size = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? 50), 1), 200);
      const offset = Number(url.searchParams.get("page_token") || 0);
      const next = offset + size < list.length ? String(offset + size) : "";
      return HttpResponse.json({
        items: list.slice(offset, offset + size),
        next_page_token: next,
      } satisfies S["ImportItemPage"]);
    }),
  ];
}
