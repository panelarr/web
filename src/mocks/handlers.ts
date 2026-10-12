// SPDX-License-Identifier: GPL-3.0-or-later

import { HttpResponse, sse } from "msw";
import type { EventType } from "@/api/event-types";
import type { components } from "@/api/schema.gen";
import { CATALOG, coverSvg, summary, withinCeiling } from "./catalog";
import { continueChapter, seriesChapters, unifiedChapters } from "./chapters";
import { health, sources as sourceFixtures, systemInfo } from "./data";
import { commit, currentUser, db, type MockInvite, newId, syncSessionCookie } from "./db";
import { downloadItem, queueDownload } from "./downloads";
import { emit, onMockEvent } from "./events";
import { finishRun, queueState, startRun, taskEvent } from "./jobs";
import { type MockOperation, mockUrl, op, problem } from "./op";
import { pageCount, pageSvg } from "./reader";
import { FILTERS, listSeries, seriesIndex, sourceChapters, sourceSeries } from "./sources";
import { entryCandidates, matchSeries, resolveUrl, startMatching } from "./works";

type S = components["schemas"];

const CSRF = "mock-csrf-token";

/** What a new user may do unless the admin says otherwise. */
const DEFAULT_GRANTS: S["Grants"] = {
  may_add: true,
  may_download: false,
  may_manage_matches: false,
  content_rating_ceiling: "suggestive",
  all_sources: true,
  allowed_sources: [],
};
const now = () => new Date().toISOString();

// --- guards, like the server's -------------------------------------------------------------

function setupRequired() {
  return problem(409, "setup_required", "Setup required", "Create the admin account first.");
}

/** The signed-in user, or the error response the server would send. */
function requireUser(): S["User"] | Response {
  if (db().users.length === 0) return setupRequired();
  const user = currentUser();
  if (!user) return problem(401, "unauthenticated", "Unauthenticated", "Sign in to continue.");
  return user;
}

function requireAdmin(): S["User"] | Response {
  const user = requireUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return problem(403, "forbidden", "Forbidden", "Only admins may do this.");
  return user;
}

function signIn(user: S["User"]): S["LoginResponse"] {
  const d = db();
  d.currentUserId = user.id;
  user.last_login_at = now();
  d.sessions = d.sessions.map((s) => ({ ...s, current: false }));
  d.sessions.unshift({
    id: newId(),
    current: true,
    user_agent: typeof navigator === "undefined" ? "test" : navigator.userAgent,
    ip: "192.0.2.10",
    created_at: now(),
    last_seen_at: now(),
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (typeof document !== "undefined") {
    // biome-ignore lint/suspicious/noDocumentCookie: the mock plays the server, which sets this cookie
    document.cookie = `panelarr_csrf=${CSRF}; path=/; SameSite=Lax`;
  }
  commit();
  return { user, csrf_token: CSRF };
}

function setupStatus(): S["SetupStatus"] {
  const d = db();
  return {
    admin_created: d.users.length > 0,
    meta_configured: d.meta.check.configured,
    meta_ready: d.meta.check.ready,
    completed: d.setupCompletedAt !== undefined,
    ...(d.setupCompletedAt ? { completed_at: d.setupCompletedAt } : {}),
  };
}

function me(user: S["User"]): S["Me"] {
  const scopes: S["ApiKeyScope"][] = user.role === "admin" ? ["read", "write", "admin"] : ["read", "write"];
  return { user, auth: { method: "session", scopes } };
}

/** One more check of the metadata service: a provider being synced gains entries. */
function recheckMeta(): S["MetaConnection"] {
  const d = db();
  const check = d.meta.check;
  if (!check.configured) return d.meta;
  const providers = check.providers.map((p) =>
    d.syncing.includes(p.id) ? { ...p, records: p.records + 12_000, health: "ok" } : p,
  );
  const ready = check.reachable && check.admin_scope && providers.some((p) => p.records > 0);
  if (ready) d.syncing = [];
  d.meta = {
    ...d.meta,
    check: {
      ...check,
      providers,
      ready,
      checked_at: now(),
      ...(ready
        ? { problem: undefined }
        : { problem: "No metadata provider has entries yet. Start a sync of a provider and check again." }),
    },
  };
  commit();
  return d.meta;
}

const json = <T>(body: T, status = 200) => HttpResponse.json(body as object, { status });

/** A page of `items` from `page_token` (an offset here) and `page_size`. */
function paginate<T>(items: T[], url: URL): { items: T[]; next: string } {
  const size = Number(url.searchParams.get("page_size") ?? 30);
  const offset = Number(url.searchParams.get("page_token") || 0);
  const next = offset + size < items.length ? String(offset + size) : "";
  return { items: items.slice(offset, offset + size), next };
}

/** Catalogue entries the user may see, filtered and sorted as asked. */
function visibleCatalog(user: S["User"], url: URL): Array<[S["CatalogEntry"], number]> {
  const p = url.searchParams;
  const types = p.getAll("type");
  const statuses = p.getAll("status");
  const genres = p.getAll("genre");
  const from = Number(p.get("year_from") ?? 0);
  const to = Number(p.get("year_to") ?? 9999);
  const list = CATALOG.map((entry, i) => [entry, i] as [S["CatalogEntry"], number]).filter(
    ([e]) =>
      withinCeiling(e.content_rating, user.grants.content_rating_ceiling) &&
      (types.length === 0 || types.includes(e.type ?? "")) &&
      (statuses.length === 0 || statuses.includes(e.status ?? "")) &&
      genres.every((g) => e.genres.includes(g)) &&
      (e.year ?? 0) >= from &&
      (e.year ?? 0) <= to,
  );
  const sort = p.get("sort");
  const by: Record<string, (a: S["CatalogEntry"], b: S["CatalogEntry"]) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  };
  const compare = sort ? by[sort] : undefined;
  if (compare) list.sort(([a], [b]) => compare(a, b));
  if (p.get("reverse") === "true") list.reverse();
  return list;
}

/** What the server's write-read-delete probe would say about a storage; undefined when fine. */
function storageCheck(kind: string, settings: S["StorageSettings"]): string | undefined {
  if (kind === "local") {
    if (!settings.root?.startsWith("/")) return "The directory must be an absolute path.";
    if (settings.root.startsWith("/readonly")) return `Can't write to ${settings.root}: read-only file system.`;
    return undefined;
  }
  if (!settings.endpoint || !/^https?:\/\//.test(settings.endpoint)) return "The endpoint must be an http(s) URL.";
  if (!settings.bucket) return "Name the bucket.";
  return undefined;
}

/** Marks a catalogue entry with the user's work for it, when it's in their library. */
function inLibrary<T extends { id: string }>(user: S["User"], entry: T): T & { library_work_id?: string } {
  const d = db();
  const work = d.works.find((w) => w.entry_id === entry.id);
  const mine = work && d.library.some((e) => e.user_id === user.id && e.work_id === work.id);
  return mine && work ? { ...entry, library_work_id: work.id } : entry;
}

/** May the user fix matches? */
function requireMatcher(): S["User"] | Response {
  const user = requireUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin" && !user.grants.may_manage_matches) {
    return problem(403, "grant_required", "Not allowed", "You may not change matches.");
  }
  return user;
}

function canUseSource(user: S["User"], source: S["SourceInfo"]): boolean {
  if (!source.enabled || !source.present) return false;
  return user.role === "admin" || user.grants.all_sources || user.grants.allowed_sources.includes(source.id);
}

function usableSource(user: S["User"], id: string): S["SourceInfo"] | Response {
  const source = db().sources.find((s) => s.id === id);
  return source && canUseSource(user, source) ? source : problem(404, "not_found", "Not found", "No such source.");
}

function seriesPage(list: S["SourceSeries"][], page: string | null): S["SourceSeriesPage"] {
  const n = Math.max(1, Number(page) || 1);
  const size = 12;
  return { series: list.slice((n - 1) * size, n * size), has_next_page: n * size < list.length };
}

function workView(user: S["User"], workId: string): S["Work"] | undefined {
  const d = db();
  const work = d.works.find((w) => w.id === workId);
  if (!work) return undefined;
  const entry = d.library.find((e) => e.user_id === user.id && e.work_id === workId);
  return {
    ...work,
    in_library: entry !== undefined,
    ...(entry ? { added_at: entry.added_at } : {}),
    sources: (d.matching[workId] ?? []).filter((row) => canUseSource(user, row.source)),
  };
}

/** A chapter the user may see, with its work and its place in the work's reading order. */
function findChapter(user: S["User"], chapterId: string) {
  for (const work of db().works) {
    if (!workView(user, work.id)) continue;
    const list = unifiedChapters(db(), work.id, user.id);
    const index = list.findIndex((c) => c.chapter.id === chapterId);
    if (index >= 0) return { work, list, index };
  }
  return undefined;
}

function findSeries(workId: string, seriesId: string): S["MatchSeries"] | undefined {
  for (const row of db().matching[workId] ?? []) {
    if (row.attached?.id === seriesId) return row.attached;
    const found = row.candidates.find((c) => c.id === seriesId);
    if (found) return found;
  }
  return undefined;
}

function refreshAttachedCount(workId: string): void {
  const work = db().works.find((w) => w.id === workId);
  if (work) work.attached_sources = (db().matching[workId] ?? []).filter((r) => r.attached).length;
}

/** Attaches a series to a work on its source; the series attached before becomes a candidate. */
function attachSeries(
  workId: string,
  ref: S["SeriesRef"],
  origin: S["MatchSeries"]["origin"],
): S["MatchSeries"] | undefined {
  const d = db();
  const work = d.works.find((w) => w.id === workId);
  const row = d.matching[workId]?.find((r) => r.source.id === ref.source_id);
  const forEntry = CATALOG.findIndex((e) => e.id === work?.entry_id);
  if (!work || !row) return undefined;
  const series = matchSeries(ref.source_id, seriesIndex(ref.key), forEntry, "attached", origin);
  if (!series) return undefined;
  const previous = row.attached;
  row.candidates = row.candidates.filter((c) => c.key !== ref.key);
  if (previous && previous.key !== ref.key) row.candidates.unshift({ ...previous, state: "candidate" });
  row.attached = series;
  row.status = "matched";
  refreshAttachedCount(workId);
  emit("work.updated", { work_id: workId });
  return series;
}

/** Adds the entry's work (made once, shared) to the user's library, optionally attaching a series. */
export function addToLibrary(
  user: S["User"],
  entryId: string,
  source?: S["SeriesRef"],
): { entry: S["LibraryEntry"]; created: boolean } | undefined {
  const i = CATALOG.findIndex((e) => e.id === entryId);
  const entry = CATALOG[i];
  if (!entry) return undefined;
  const d = db();
  let work = d.works.find((w) => w.entry_id === entry.id);
  if (!work) {
    const s = summary(entry, i);
    work = {
      id: newId(),
      entry_id: entry.id,
      title: entry.title,
      ...(s.type ? { type: s.type } : {}),
      ...(s.status ? { status: s.status } : {}),
      content_rating: entry.content_rating,
      ...(s.year ? { year: s.year } : {}),
      cover_url: `/api/v1/catalog/entries/${entry.id}/cover`,
      attached_sources: 0,
    };
    d.works.push(work);
    startMatching(d, work);
  }
  if (source) attachSeries(work.id, source, "manual");
  const existing = d.library.find((e) => e.user_id === user.id && e.work_id === work.id);
  if (existing) {
    const { added_at, new_chapters, auto_download } = existing;
    return { entry: { work, added_at, new_chapters, auto_download }, created: false };
  }
  const added = { user_id: user.id, work_id: work.id, added_at: now(), new_chapters: 0, auto_download: false };
  d.library.push(added);
  emit("library.changed", { work_id: work.id });
  return { entry: { work, added_at: added.added_at, new_chapters: 0, auto_download: false }, created: true };
}

// --- the operations -----------------------------------------------------------------------

export const operations: MockOperation[] = [
  op("get", "/system/info", () => json({ ...systemInfo, setup_required: db().users.length === 0 })),

  op("get", "/system/health", () => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const ready = db().meta.check.ready;
    return json<S["SystemHealth"]>({
      ...health,
      status: ready ? "ok" : "degraded",
      components: health.components.map((c) =>
        c.name === "meta" && !ready ? { ...c, status: "failing", error: "No provider has entries yet" } : c,
      ),
    });
  }),

  // Setup

  op("get", "/setup", () => json(setupStatus())),

  op("post", "/setup/admin", async ({ request }) => {
    if (db().users.length > 0) return problem(409, "already_set_up", "Already set up", "The admin account exists.");
    const body = (await request.json()) as S["CreateSetupAdminRequest"];
    const user: S["User"] = {
      id: newId(),
      username: body.username,
      display_name: body.display_name ?? "",
      role: "admin",
      disabled: false,
      grants: {
        may_add: true,
        may_download: true,
        may_manage_matches: true,
        content_rating_ceiling: "pornographic",
        all_sources: true,
        allowed_sources: [],
      },
      created_at: now(),
    };
    db().users.push(user);
    db().passwords[body.username.toLowerCase()] = body.password;
    return json(signIn(user), 201);
  }),

  op("post", "/setup/complete", () => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    db().setupCompletedAt ??= now();
    commit();
    return json(setupStatus());
  }),

  // Auth

  op("post", "/auth/login", async ({ request }) => {
    const d = db();
    if (d.users.length === 0) return setupRequired();
    if (d.failedLogins >= 5) {
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Too many requests",
          status: 429,
          code: "rate_limited",
          detail: "Too many failed sign-ins. Wait a moment and try again.",
        },
        { status: 429, headers: { "Content-Type": "application/problem+json", "Retry-After": "30" } },
      );
    }
    const body = (await request.json()) as S["LoginRequest"];
    const user = d.users.find((u) => u.username.toLowerCase() === body.username.toLowerCase());
    if (!user || d.passwords[user.username.toLowerCase()] !== body.password || user.disabled) {
      d.failedLogins += 1;
      commit();
      return problem(401, "invalid_credentials", "Invalid credentials", "Wrong username or password.");
    }
    d.failedLogins = 0;
    return json(signIn(user));
  }),

  op("post", "/auth/logout", () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    d.sessions = d.sessions.filter((s) => !s.current);
    d.currentUserId = undefined;
    syncSessionCookie();
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("post", "/auth/invites/check", async ({ request }) => {
    const { token } = (await request.json()) as S["InviteToken"];
    const invite = db().invites.find((i) => i.token === token && Date.parse(i.expires_at) > Date.now());
    if (!invite)
      return problem(404, "invite_invalid", "Invite not valid", "This invite link is unknown, used or expired.");
    return json<S["InviteCheck"]>({ role: invite.role, expires_at: invite.expires_at });
  }),

  op("post", "/auth/invites/accept", async ({ request }) => {
    const body = (await request.json()) as S["AcceptInviteRequest"];
    const d = db();
    const invite = d.invites.find((i) => i.token === body.token && Date.parse(i.expires_at) > Date.now());
    if (!invite)
      return problem(404, "invite_invalid", "Invite not valid", "This invite link is unknown, used or expired.");
    if (d.users.some((u) => u.username.toLowerCase() === body.username.toLowerCase())) {
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Invalid request",
          status: 400,
          code: "invalid_request",
          detail: "That username is taken.",
          errors: [{ field: "username", message: "is taken" }],
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const user: S["User"] = {
      id: newId(),
      username: body.username,
      display_name: body.display_name ?? "",
      role: invite.role,
      disabled: false,
      grants: invite.grants,
      created_at: now(),
    };
    d.users.push(user);
    d.passwords[body.username.toLowerCase()] = body.password;
    d.invites = d.invites.filter((i) => i !== invite);
    return json(signIn(user), 201);
  }),

  // Me

  op("get", "/me", () => {
    const user = requireUser();
    return user instanceof Response ? user : json(me(user));
  }),

  op("patch", "/me", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const body = (await request.json()) as S["UpdateMeRequest"];
    if (body.display_name !== undefined) user.display_name = body.display_name;
    commit();
    return json(me(user));
  }),

  op("post", "/me/password", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const body = (await request.json()) as S["ChangePasswordRequest"];
    const d = db();
    if (d.passwords[user.username.toLowerCase()] !== body.current_password) {
      return problem(403, "invalid_credentials", "Invalid credentials", "The current password is wrong.");
    }
    d.passwords[user.username.toLowerCase()] = body.new_password;
    d.sessions = d.sessions.filter((s) => s.current);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("get", "/me/sessions", () => {
    const user = requireUser();
    return user instanceof Response ? user : json<S["SessionList"]>({ sessions: db().sessions });
  }),

  op("delete", "/me/sessions/{id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    if (!d.sessions.some((s) => s.id === params.id)) return problem(404, "not_found", "Not found");
    d.sessions = d.sessions.filter((s) => s.id !== params.id);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("get", "/me/api-keys", () => {
    const user = requireUser();
    return user instanceof Response ? user : json<S["ApiKeyList"]>({ api_keys: db().apiKeys });
  }),

  op("post", "/me/api-keys", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const body = (await request.json()) as S["CreateApiKeyRequest"];
    if (user.role !== "admin" && body.scopes.some((s) => s === "admin" || s === "metrics:read")) {
      return problem(403, "forbidden", "Forbidden", "Only admins may create keys with the admin or metrics scope.");
    }
    const secret = `pnl_${crypto.randomUUID().replaceAll("-", "")}`;
    const created: S["ApiKey"] = {
      id: newId(),
      name: body.name,
      prefix: secret.slice(0, 8),
      scopes: body.scopes,
      created_at: now(),
      ...(body.expires_at ? { expires_at: body.expires_at } : {}),
    };
    db().apiKeys.unshift(created);
    commit();
    return json<S["ApiKeyCreated"]>({ api_key: created, key: secret }, 201);
  }),

  op("delete", "/me/api-keys/{id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    d.apiKeys = d.apiKeys.filter((k) => k.id !== params.id);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // The metadata service connection

  op("get", "/system/meta", () => {
    const user = requireAdmin();
    return user instanceof Response ? user : json(db().meta);
  }),

  op("put", "/system/meta", async ({ request }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const d = db();
    if (d.meta.managed_by_env) return problem(409, "managed_by_env", "Managed by the environment");
    const body = (await request.json()) as S["SetMetaConnectionRequest"];
    if (!/^https?:\/\/\S+$/.test(body.url)) {
      return problem(
        422,
        "meta_check_failed",
        "The metadata service check failed",
        `Can't reach ${body.url}: not an http(s) URL.`,
      );
    }
    if (!body.api_key && !d.meta.check.configured) {
      return problem(
        422,
        "meta_check_failed",
        "The metadata service check failed",
        "The service needs an admin API key.",
      );
    }
    if (body.api_key === "wrong") {
      return problem(422, "meta_check_failed", "The metadata service check failed", "The API key was rejected.");
    }
    d.meta = {
      url: body.url,
      managed_by_env: false,
      check: {
        configured: true,
        reachable: true,
        key_valid: true,
        admin_scope: true,
        ready: false,
        problem: "No metadata provider has entries yet. Start a sync of a provider and check again.",
        providers: [{ id: "example-provider", health: "ok", records: 0 }],
        checked_at: now(),
      },
    };
    return json(recheckMeta());
  }),

  op("post", "/system/meta/check", () => {
    const user = requireAdmin();
    return user instanceof Response ? user : json(recheckMeta());
  }),

  op("post", "/system/meta/providers/{provider}/sync", ({ params }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const provider = String(params.provider);
    if (!db().meta.check.providers.some((p) => p.id === provider)) return problem(404, "not_found", "Not found");
    db().syncing.push(provider);
    commit();
    return json<S["MetaSyncStarted"]>({ run_id: newId() }, 202);
  }),

  // Plugins (the wizard's optional step; the full admin comes later)

  op("get", "/plugins", () => {
    const user = requireAdmin();
    return user instanceof Response ? user : json<S["PluginList"]>({ plugins: db().plugins });
  }),

  op("post", "/plugins", async ({ request }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const body = (await request.json()) as S["RegisterPluginRequest"];
    if (!/^https?:\/\/\S+$/.test(body.url)) {
      return problem(422, "plugin_unreachable", "The plugin didn't answer", `Can't reach ${body.url}.`);
    }
    const id = body.id ?? "example";
    if (db().plugins.some((p) => p.id === id))
      return problem(409, "plugin_id_taken", "ID taken", `A plugin "${id}" exists.`);
    const added: S["Plugin"] = {
      id,
      url: body.url,
      enabled: true,
      name: "Example Source Plugin",
      plugin_id: "example",
      version: "0.1.0",
      contracts: ["panelarr.source.v1"],
      capabilities: ["latest", "search"],
      has_config: false,
      health: "ok",
      checked_at: now(),
      source_count: 3,
      created_at: now(),
    };
    db().plugins.push(added);
    // The example plugin lists the example sources.
    if (id === "example" && !db().sources.some((source) => source.plugin_id === id)) {
      db().sources.push(...structuredClone(sourceFixtures));
    }
    commit();
    return json(added, 201);
  }),

  op("get", "/plugins/{plugin_id}", ({ params }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const found = db().plugins.find((p) => p.id === params.plugin_id);
    return found ? json(found) : problem(404, "not_found", "Not found");
  }),

  op("patch", "/plugins/{plugin_id}", async ({ params, request }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const found = db().plugins.find((p) => p.id === params.plugin_id);
    if (!found) return problem(404, "not_found", "Not found");
    const body = (await request.json()) as S["UpdatePluginRequest"];
    if (body.url !== undefined) {
      if (!/^https?:\/\/\S+$/.test(body.url))
        return problem(422, "plugin_unreachable", "The plugin didn't answer", `Can't reach ${body.url}.`);
      found.url = body.url;
    }
    if (body.enabled !== undefined) found.enabled = body.enabled;
    commit();
    return json(found);
  }),

  op("delete", "/plugins/{plugin_id}", ({ params }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const d = db();
    d.plugins = d.plugins.filter((p) => p.id !== params.plugin_id);
    d.sources = d.sources.filter((source) => source.plugin_id !== params.plugin_id);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("post", "/plugins/{plugin_id}/sync", ({ params }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const found = db().plugins.find((p) => p.id === params.plugin_id);
    if (!found) return problem(404, "not_found", "Not found");
    checkPlugin(found);
    return json(found);
  }),

  op("get", "/plugins/{plugin_id}/config", ({ params }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const config = db().pluginConfigs[String(params.plugin_id)];
    if (!config) return problem(404, "no_config", "No settings", "This plugin has no settings.");
    return json(config);
  }),

  op("put", "/plugins/{plugin_id}/config", async ({ params, request }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const config = db().pluginConfigs[String(params.plugin_id)];
    if (!config) return problem(404, "no_config", "No settings", "This plugin has no settings.");
    const { values } = (await request.json()) as S["SetPluginConfigRequest"];
    if (typeof values.base_url === "string" && !/^https?:\/\//.test(values.base_url)) {
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Invalid settings",
          status: 400,
          code: "invalid_config",
          detail: "The plugin rejected the settings.",
          errors: [{ field: "base_url", message: "must be an http(s) URL" }],
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    // Like the plugin's schema check: every store is an object with a URL.
    const stores = Array.isArray(values.stores) ? (values.stores as unknown[]) : [];
    const bad = stores.findIndex((store) => typeof store !== "object" || !store || !("url" in store));
    if (bad >= 0) {
      return problem(400, "invalid_config", "Invalid settings", `stores/${bad}: want an object with a url`);
    }
    // Secret fields come back empty; leaving them empty keeps the stored value.
    config.values = { ...values, api_token: "" };
    commit();
    // Like the server: check the plugin soon after, once it has applied the settings.
    const plugin = db().plugins.find((p) => p.id === String(params.plugin_id));
    const state = db();
    if (plugin) setTimeout(() => db() === state && checkPlugin(plugin), PLUGIN_RECHECK_MS);
    return json(config);
  }),

  // Sources

  op("get", "/sources", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const all = url.searchParams.get("all") === "true" && user.role === "admin";
    const lang = url.searchParams.get("lang");
    const list = db().sources.filter((source) => {
      if (lang && source.lang !== lang) return false;
      if (all) return true;
      if (!source.enabled || !source.present) return false;
      return user.role === "admin" || user.grants.all_sources || user.grants.allowed_sources.includes(source.id);
    });
    return json<S["SourceList"]>({ sources: list });
  }),

  op("patch", "/sources/{source_id}", async ({ params, request }) => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const source = db().sources.find((s) => s.id === params.source_id);
    if (!source) return problem(404, "not_found", "Not found");
    source.enabled = ((await request.json()) as S["UpdateSourceRequest"]).enabled;
    commit();
    return json(source);
  }),

  // Users

  op("get", "/users", () => {
    const user = requireAdmin();
    if (user instanceof Response) return user;
    const users = [...db().users].sort((a, b) => a.username.localeCompare(b.username));
    return json<S["UserList"]>({ users, next_page_token: "" });
  }),

  op("post", "/users", async ({ request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as S["CreateUserRequest"];
    const d = db();
    if (d.users.some((u) => u.username.toLowerCase() === body.username.toLowerCase())) {
      return problem(409, "username_taken", "Username taken", `"${body.username}" is taken.`);
    }
    const user: S["User"] = {
      id: newId(),
      username: body.username,
      display_name: body.display_name ?? "",
      role: body.role ?? "user",
      disabled: false,
      grants: { ...DEFAULT_GRANTS, ...body.grants },
      created_at: now(),
    };
    d.users.push(user);
    d.passwords[body.username.toLowerCase()] = body.password;
    commit();
    return json(user, 201);
  }),

  op("get", "/users/{id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const user = db().users.find((u) => u.id === params.id);
    return user ? json(user) : problem(404, "not_found", "Not found");
  }),

  op("patch", "/users/{id}", async ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const user = d.users.find((u) => u.id === params.id);
    if (!user) return problem(404, "not_found", "Not found");
    const body = (await request.json()) as S["UpdateUserRequest"];
    const demoting = (body.role !== undefined && body.role !== "admin") || body.disabled === true;
    if (demoting && user.id === admin.id) {
      return problem(
        409,
        "cannot_change_self",
        "Can't change yourself",
        "You can't disable or demote your own account.",
      );
    }
    const otherAdmins = d.users.filter((u) => u.role === "admin" && !u.disabled && u.id !== user.id);
    if (demoting && user.role === "admin" && otherAdmins.length === 0) {
      return problem(409, "last_admin", "Last admin", "Panelarr needs at least one enabled admin.");
    }
    if (body.display_name !== undefined) user.display_name = body.display_name;
    if (body.role !== undefined) user.role = body.role;
    if (body.disabled !== undefined) user.disabled = body.disabled;
    if (body.password !== undefined) d.passwords[user.username.toLowerCase()] = body.password;
    if (body.grants) user.grants = { ...user.grants, ...body.grants };
    commit();
    return json(user);
  }),

  op("delete", "/users/{id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    if (params.id === admin.id) {
      return problem(409, "cannot_change_self", "Can't delete yourself", "You can't delete your own account.");
    }
    const d = db();
    d.users = d.users.filter((u) => u.id !== params.id);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // Invites

  op("get", "/invites", () => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const open = db().invites.filter((i) => Date.parse(i.expires_at) > Date.now());
    return json<S["InviteList"]>({ invites: open.map(({ token: _token, ...rest }) => rest) });
  }),

  op("post", "/invites", async ({ request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as S["CreateInviteRequest"];
    const created: MockInvite = {
      id: newId(),
      token: crypto.randomUUID().replaceAll("-", ""),
      role: body.role ?? "user",
      grants: { ...DEFAULT_GRANTS, ...body.grants },
      note: body.note ?? "",
      created_at: now(),
      expires_at: new Date(Date.now() + (body.expires_in_hours ?? 72) * 3_600_000).toISOString(),
    };
    db().invites.unshift(created);
    commit();
    const { token, ...invite } = created;
    return json<S["InviteCreated"]>({ invite, token }, 201);
  }),

  op("delete", "/invites/{id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    d.invites = d.invites.filter((i) => i.id !== params.id);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // The catalogue

  op("get", "/catalog/search", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const found = visibleCatalog(user, url).flatMap(([entry, i]) => {
      const title = entry.titles.find((t) => t.text.toLowerCase().includes(q));
      if (!title) return [];
      return [
        { entry: inLibrary(user, summary(entry, i)), ...(title.text !== entry.title ? { matched: title.text } : {}) },
      ];
    });
    const { items, next } = paginate(found, url);
    return json<S["CatalogSearchPage"]>({
      hits: items,
      next_page_token: next,
      total_size: found.length,
      no_providers: false,
    });
  }),

  op("get", "/catalog/browse", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    if (!db().meta.check.providers.length) {
      return json<S["CatalogPage"]>({ entries: [], next_page_token: "", no_providers: true });
    }
    const all = visibleCatalog(user, url).map(([entry, i]) => inLibrary(user, summary(entry, i)));
    const { items, next } = paginate(all, url);
    return json<S["CatalogPage"]>({
      entries: items,
      next_page_token: next,
      total_size: all.length,
      no_providers: false,
    });
  }),

  op("get", "/catalog/entries/{entry_id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const entry = CATALOG.find((e) => e.id === params.entry_id);
    if (!entry || !withinCeiling(entry.content_rating, user.grants.content_rating_ceiling)) {
      return problem(404, "not_found", "Not found");
    }
    return json(inLibrary(user, entry));
  }),

  op("get", "/catalog/entries/{entry_id}/cover", ({ params }) => {
    const i = CATALOG.findIndex((e) => e.id === params.entry_id);
    const entry = CATALOG[i];
    if (!entry) return problem(404, "not_found", "Not found");
    return new HttpResponse(coverSvg(entry, i), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=86400" },
    });
  }),

  // The library (more with works and matching)

  op("get", "/library", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
    const entries: S["LibraryEntry"][] = d.library
      .filter((e) => e.user_id === user.id)
      .flatMap((e) => {
        const work = d.works.find((w) => w.id === e.work_id);
        if (!work || (q && !work.title.toLowerCase().includes(q))) return [];
        return [{ work, added_at: e.added_at, new_chapters: e.new_chapters, auto_download: e.auto_download }];
      })
      .sort((a, b) => a.work.title.localeCompare(b.work.title));
    const { items, next } = paginate(entries, new URL(request.url));
    return json<S["LibraryPage"]>({ entries: items, next_page_token: next });
  }),

  op("post", "/library", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    if (user.role !== "admin" && !user.grants.may_add) {
      return problem(403, "grant_required", "Not allowed", "You may not add works.");
    }
    const body = (await request.json()) as S["AddToLibraryRequest"];
    const added = addToLibrary(user, body.entry_id, body.source);
    if (!added) return problem(404, "not_found", "Not found");
    commit();
    return json(added.entry, added.created ? 201 : 200);
  }),

  op("post", "/library/from-source", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    if (user.role !== "admin" && !user.grants.may_add) {
      return problem(403, "grant_required", "Not allowed", "You may not add works.");
    }
    const ref = (await request.json()) as S["SeriesRef"];
    const candidates = entryCandidates(ref.source_id, ref.key);
    const best = candidates[0];
    // Clear: the exact title with a shared author.
    if (best && best.score === 1 && best.authors_match) {
      const added = addToLibrary(user, best.entry.id, ref);
      commit();
      return json<S["AddFromSourceResult"]>({ added: true, ...(added ? { entry: added.entry } : {}), candidates: [] });
    }
    return json<S["AddFromSourceResult"]>({ added: false, candidates });
  }),

  op("delete", "/library/{work_id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    d.library = d.library.filter((e) => !(e.user_id === user.id && e.work_id === params.work_id));
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // Works and matching

  op("get", "/works/{work_id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const view = workView(user, String(params.work_id));
    return view ? json(view) : problem(404, "not_found", "Not found");
  }),

  op("get", "/works/{work_id}/cover", ({ params }) => {
    const work = db().works.find((w) => w.id === params.work_id);
    const i = CATALOG.findIndex((e) => e.id === work?.entry_id);
    const entry = CATALOG[i];
    if (!entry) return problem(404, "not_found", "Not found");
    return new HttpResponse(coverSvg(entry, i), { headers: { "Content-Type": "image/svg+xml" } });
  }),

  op("post", "/works/{work_id}/match", async ({ params, request }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const rows = db().matching[String(params.work_id)];
    if (!rows) return problem(404, "not_found", "Not found");
    const text = await request.text();
    const force = text ? ((JSON.parse(text) as S["MatchWorkRequest"]).force ?? false) : false;
    for (const row of rows) {
      if (row.attached && !force) continue;
      row.status = "pending";
      delete row.message;
      row.candidates = row.candidates.filter((c) => c.state === "rejected");
    }
    emit("work.updated", { work_id: String(params.work_id) });
    commit();
    return json<S["TaskRef"]>({ task_id: newId() }, 202);
  }),

  op("post", "/works/{work_id}/series", async ({ params, request }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    const body = (await request.json()) as S["AttachSeriesRequest"];
    const ref = body.url
      ? resolveUrl(body.url)
      : body.source_id && body.key
        ? { source_id: body.source_id, key: body.key }
        : undefined;
    if (!ref) return problem(404, "not_found", "Not found", "No plugin recognises that URL.");
    const attached = attachSeries(workId, ref, body.url ? "url" : "manual");
    if (!attached) return problem(404, "not_found", "Not found", "That series isn't on the source.");
    commit();
    return json(attached, 201);
  }),

  op("patch", "/works/{work_id}/series/{series_id}", async ({ params, request }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const series = findSeries(String(params.work_id), String(params.series_id));
    if (!series) return problem(404, "not_found", "Not found");
    series.priority = ((await request.json()) as S["UpdateWorkSeriesRequest"]).priority;
    commit();
    return json(series);
  }),

  op("post", "/works/{work_id}/series/{series_id}/attach", ({ params }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const series = findSeries(String(params.work_id), String(params.series_id));
    if (!series) return problem(404, "not_found", "Not found");
    const attached = attachSeries(String(params.work_id), { source_id: series.source_id, key: series.key }, "manual");
    commit();
    return attached ? json(attached) : problem(404, "not_found", "Not found");
  }),

  op("post", "/works/{work_id}/series/{series_id}/detach", ({ params }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    const row = db().matching[workId]?.find(
      (r) => r.attached?.id === params.series_id || r.candidates.some((c) => c.id === params.series_id),
    );
    if (!row) return problem(404, "not_found", "Not found");
    let rejected: S["MatchSeries"] | undefined;
    const attached = row.attached;
    if (attached && attached.id === params.series_id) {
      const gone: S["MatchSeries"] = { ...attached, state: "rejected" };
      rejected = gone;
      delete row.attached;
      row.candidates = [gone, ...row.candidates];
      row.status = row.candidates.some((c) => c.state === "candidate") ? "candidates" : "no_match";
    } else {
      row.candidates = row.candidates.map((c) => {
        if (c.id !== params.series_id) return c;
        const gone: S["MatchSeries"] = { ...c, state: "rejected" };
        rejected = gone;
        return gone;
      });
    }
    refreshAttachedCount(workId);
    emit("work.updated", { work_id: workId });
    commit();
    return rejected ? json(rejected) : problem(404, "not_found", "Not found");
  }),

  // Chapters

  op("get", "/works/{work_id}/chapters", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    if (!workView(user, workId)) return problem(404, "not_found", "Not found");
    const chapters = unifiedChapters(db(), workId, user.id).map((c) => c.chapter);
    if (new URL(request.url).searchParams.get("order") === "desc") chapters.reverse();
    return json<S["ChapterList"]>({ chapters });
  }),

  op("get", "/works/{work_id}/chapters/{chapter_id}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = unifiedChapters(db(), String(params.work_id), user.id).find(
      (c) => c.chapter.id === params.chapter_id,
    );
    return found ? json<S["ChapterDetail"]>(found) : problem(404, "not_found", "Not found");
  }),

  op("put", "/works/{work_id}/chapters/{chapter_id}/pin", async ({ params, request }) => {
    const user = requireMatcher();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    const chapterId = String(params.chapter_id);
    const { variant_id } = (await request.json()) as S["PinVariantRequest"];
    const d = db();
    d.pins[workId] ??= {};
    const pins = d.pins[workId];
    if (variant_id) pins[chapterId] = variant_id;
    else delete pins[chapterId];
    const found = unifiedChapters(d, workId, user.id).find((c) => c.chapter.id === chapterId);
    if (!found) return problem(404, "not_found", "Not found");
    if (variant_id && !found.variants.some((v) => v.id === variant_id))
      return problem(400, "invalid_request", "Unknown copy");
    emit("work.updated", { work_id: workId });
    commit();
    return json<S["ChapterDetail"]>(found);
  }),

  op("get", "/works/{work_id}/series/{series_id}/chapters", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const list = seriesChapters(db(), String(params.work_id), String(params.series_id));
    return list ? json(list) : problem(404, "not_found", "Not found");
  }),

  op("post", "/works/{work_id}/refresh", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    const d = db();
    const attached = (d.matching[workId] ?? []).filter((r) => r.attached).length;
    // The check "finds" the newest chapter again, so the new badge can be seen.
    const newest = unifiedChapters(d, workId, user.id)
      .filter((c) => !c.chapter.extra)
      .at(-1);
    if (newest) {
      for (const entry of d.library.filter((e) => e.work_id === workId)) {
        d.fresh[entry.user_id] ??= {};
        const fresh = d.fresh[entry.user_id] as Record<string, string[]>;
        fresh[workId] = [...new Set([...(fresh[workId] ?? []), newest.chapter.id])];
        entry.new_chapters = fresh[workId].length;
      }
      emit("chapters.new", { work_id: workId, new: 1 });
    }
    commit();
    return json<S["RefreshQueued"]>({ queued: attached }, 202);
  }),

  op("post", "/library/{work_id}/seen", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    const workId = String(params.work_id);
    if (d.fresh[user.id]) delete d.fresh[user.id]?.[workId];
    const entry = d.library.find((e) => e.user_id === user.id && e.work_id === workId);
    if (entry) entry.new_chapters = 0;
    emit("library.changed", { work_id: workId });
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // Progress

  op("get", "/works/{work_id}/progress", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const workId = String(params.work_id);
    const chapters = unifiedChapters(db(), workId, user.id).map((c) => c.chapter);
    const mine = db().progress[user.id] ?? {};
    const ids = new Set(chapters.map((c) => c.id));
    const continueId = continueChapter(chapters, mine);
    return json<S["WorkProgress"]>({
      chapters: Object.values(mine).filter((p) => ids.has(p.chapter_id)),
      ...(continueId ? { continue_chapter_id: continueId } : {}),
    });
  }),

  op("post", "/works/{work_id}/progress", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const { chapter_ids, read } = (await request.json()) as S["MarkReadRequest"];
    const d = db();
    d.progress[user.id] ??= {};
    const mine = d.progress[user.id] as Record<string, S["ChapterProgress"]>;
    for (const id of chapter_ids) {
      if (read)
        mine[id] = {
          chapter_id: id,
          page: mine[id]?.pages ? (mine[id]?.pages ?? 1) - 1 : 0,
          ...(mine[id]?.pages ? { pages: mine[id]?.pages } : {}),
          completed: true,
          updated_at: now(),
        };
      else delete mine[id];
    }
    emit("progress.synced", { work_id: String(params.work_id) });
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // The reader

  op("get", "/chapters/{chapter_id}/pages", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = findChapter(user, String(params.chapter_id));
    if (!found) return problem(404, "not_found", "Not found");
    const { work, list, index } = found;
    const { chapter, variants } = list[index] as { chapter: S["UnifiedChapter"]; variants: S["ChapterVariant"][] };
    const variantId = new URL(request.url).searchParams.get("variant_id");
    const variant = variants.find((v) => v.id === variantId) ?? chapter.chosen ?? variants[0];
    if (!variant) return problem(404, "no_copy", "No copy", "No source you may use has this chapter.");
    const progress = db().progress[user.id]?.[chapter.id];
    const prev = list[index - 1]?.chapter.id;
    const next = list[index + 1]?.chapter.id;
    return json<S["ChapterPages"]>({
      work_id: work.id,
      chapter,
      variant,
      origin: chapter.downloaded ? "file" : "source",
      pages: Array.from({ length: pageCount(chapter) }, (_, i) => ({
        index: i,
        url: `/api/v1/chapters/${chapter.id}/pages/${i}`,
      })),
      ...(prev ? { prev_chapter_id: prev } : {}),
      ...(next ? { next_chapter_id: next } : {}),
      ...(progress ? { progress } : {}),
    });
  }),

  op("get", "/chapters/{chapter_id}/pages/{index}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = findChapter(user, String(params.chapter_id));
    const chapter = found?.list[found.index]?.chapter;
    if (!found || !chapter) return problem(404, "not_found", "Not found");
    const strip = ["manhwa", "manhua", "webtoon"].includes(found.work.type ?? "");
    return new HttpResponse(pageSvg(chapter, Number(params.index), strip), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" },
    });
  }),

  op("put", "/chapters/{chapter_id}/progress", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const found = findChapter(user, String(params.chapter_id));
    if (!found) return problem(404, "not_found", "Not found");
    const body = (await request.json()) as S["SetProgressRequest"];
    const d = db();
    d.progress[user.id] ??= {};
    const mine = d.progress[user.id] as Record<string, S["ChapterProgress"]>;
    const id = String(params.chapter_id);
    const completed =
      body.completed ??
      (body.pages !== undefined && body.page >= body.pages - 1 ? true : (mine[id]?.completed ?? false));
    mine[id] = {
      chapter_id: id,
      page: body.page,
      ...(body.pages ? { pages: body.pages } : {}),
      completed,
      updated_at: now(),
    };
    emit("progress.synced", { work_id: found.work.id, chapter_id: id, page: body.page, completed });
    commit();
    return json(mine[id]);
  }),

  op("get", "/me/history", () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const items: S["HistoryItem"][] = [];
    for (const p of Object.values(db().progress[user.id] ?? {})) {
      const found = findChapter(user, p.chapter_id);
      const chapter = found?.list[found.index]?.chapter;
      if (!found || !chapter) continue;
      items.push({
        work_id: found.work.id,
        work_title: found.work.title,
        ...(found.work.cover_url ? { work_cover_url: found.work.cover_url } : {}),
        chapter_id: chapter.id,
        ...(chapter.number !== undefined ? { chapter_number: chapter.number } : {}),
        chapter_title: chapter.title,
        page: p.page,
        ...(p.pages ? { pages: p.pages } : {}),
        completed: p.completed,
        updated_at: p.updated_at,
      });
    }
    items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return json<S["HistoryPage"]>({ items, next_page_token: "" });
  }),

  op("get", "/me/reader-settings", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const mine = db().readerSettings[user.id] ?? {};
    const sourceId = url.searchParams.get("source_id");
    const workId = url.searchParams.get("work_id");
    const global = mine.global;
    const source = sourceId ? mine[`source:${sourceId}`] : undefined;
    const work = workId ? mine[`work:${workId}`] : undefined;
    return json<S["ReaderSettings"]>({
      ...(global ? { global } : {}),
      ...(source ? { source } : {}),
      ...(work ? { work } : {}),
      effective: { ...global, ...source, ...work },
    });
  }),

  op("put", "/me/reader-settings/{scope}", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const d = db();
    d.readerSettings[user.id] ??= {};
    (d.readerSettings[user.id] as Record<string, Record<string, unknown>>)[String(params.scope)] =
      (await request.json()) as Record<string, unknown>;
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("delete", "/me/reader-settings/{scope}", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    delete db().readerSettings[user.id]?.[String(params.scope)];
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("get", "/me/preferences", () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    return json(db().preferences[user.id] ?? {});
  }),

  op("put", "/me/preferences", async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    db().preferences[user.id] = (await request.json()) as Record<string, unknown>;
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // Downloads

  op("post", "/works/{work_id}/downloads", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    if (user.role !== "admin" && !user.grants.may_download) {
      return problem(403, "grant_required", "Not allowed", "You may not download.");
    }
    const workId = String(params.work_id);
    const work = workView(user, workId);
    if (!work) return problem(404, "not_found", "Not found");
    const body = (await request.json()) as S["DownloadChaptersRequest"];
    const d = db();
    const all = unifiedChapters(d, workId, user.id).map((c) => c.chapter);
    const mine = d.progress[user.id] ?? {};
    const picked = body.chapter_ids
      ? all.filter((c) => body.chapter_ids?.includes(c.id))
      : body.scope === "unread"
        ? all.filter((c) => !mine[c.id]?.completed)
        : all;
    const result = { queued: 0, downloaded: 0, unavailable: 0 };
    for (const chapter of picked) {
      if (!chapter.available) {
        result.unavailable += 1;
        continue;
      }
      const outcome = queueDownload(d, { id: chapter.id, title: chapter.title, number: chapter.number }, work, user.id);
      if (outcome === "queued") result.queued += 1;
      if (outcome === "downloaded") result.downloaded += 1;
    }
    commit();
    return json<S["DownloadsQueued"]>(result, 202);
  }),

  op("get", "/downloads", ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const everyone = url.searchParams.get("all") === "true" && user.role === "admin";
    const state = url.searchParams.get("state");
    const items = db()
      .tasks.filter(
        (t) => t.kind === "download.chapter" && (everyone || t.created_by === user.id) && (!state || t.state === state),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(downloadItem)
      .filter((item): item is S["DownloadItem"] => item !== undefined);
    const { items: page, next } = paginate(items, url);
    return json<S["DownloadPage"]>({ items: page, next_page_token: next });
  }),

  op("put", "/library/{work_id}/auto-download", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    if (user.role !== "admin" && !user.grants.may_download) {
      return problem(403, "grant_required", "Not allowed", "You may not download.");
    }
    const entry = db().library.find((e) => e.user_id === user.id && e.work_id === params.work_id);
    if (!entry) return problem(404, "not_found", "Not in your library");
    entry.auto_download = ((await request.json()) as S["AutoDownloadRequest"]).enabled;
    emit("library.changed", { work_id: String(params.work_id) });
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("delete", "/chapters/{chapter_id}/file", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const id = String(params.chapter_id);
    if (!d.downloaded.includes(id)) return problem(404, "not_found", "Not downloaded");
    d.downloaded = d.downloaded.filter((c) => c !== id);
    const storage = d.storages.find((s) => s.default);
    if (storage && storage.files > 0) storage.files -= 1;
    const found = findChapter(admin, id);
    if (found) emit("work.updated", { work_id: found.work.id });
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  // Storage

  op("get", "/storages", () => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const list = [...db().storages].sort((a, b) => Number(b.default) - Number(a.default));
    return json<S["StorageList"]>({ storages: list });
  }),

  op("post", "/storages", async ({ request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as S["CreateStorageRequest"];
    const d = db();
    if (d.storages.some((s) => s.id === body.id))
      return problem(409, "storage_exists", "ID taken", `A storage "${body.id}" exists.`);
    const failed = storageCheck(body.kind, body);
    if (failed) return problem(422, "storage_check_failed", "The storage check failed", failed);
    const { secret_key, ...settings } = body;
    const created: S["StorageInfo"] = {
      ...settings,
      name: body.name ?? body.id,
      default: false,
      has_secret: !!secret_key,
      files: 0,
    };
    d.storages.push(created);
    commit();
    return json(created, 201);
  }),

  op("patch", "/storages/{storage_id}", async ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const storage = d.storages.find((s) => s.id === params.storage_id);
    if (!storage) return problem(404, "not_found", "Not found");
    const { default: makeDefault, secret_key, ...change } = (await request.json()) as S["UpdateStorageRequest"];
    const failed = storageCheck(storage.kind, { ...storage, ...change });
    if (failed) return problem(422, "storage_check_failed", "The storage check failed", failed);
    Object.assign(storage, change);
    if (secret_key) storage.has_secret = true;
    if (makeDefault) for (const s of d.storages) s.default = s.id === storage.id;
    commit();
    return json(storage);
  }),

  op("delete", "/storages/{storage_id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const storage = d.storages.find((s) => s.id === params.storage_id);
    if (!storage) return problem(404, "not_found", "Not found");
    if (storage.default)
      return problem(409, "storage_default", "The default storage", "Make another storage the default first.");
    if (storage.files > 0)
      return problem(
        409,
        "storage_in_use",
        "Files are on it",
        `Move its ${storage.files} files to another storage first.`,
      );
    d.storages = d.storages.filter((s) => s !== storage);
    commit();
    return new HttpResponse(null, { status: 204 });
  }),

  op("post", "/storages/{storage_id}/test", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const storage = db().storages.find((s) => s.id === params.storage_id);
    if (!storage) return problem(404, "not_found", "Not found");
    const failed = storageCheck(storage.kind, storage);
    return json<S["StorageTest"]>(failed ? { ok: false, error: failed } : { ok: true });
  }),

  op("post", "/storages/{storage_id}/move", async ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const from = d.storages.find((s) => s.id === params.storage_id);
    const { to } = (await request.json()) as S["MoveStorageRequest"];
    const target = d.storages.find((s) => s.id === to);
    if (!from || !target) return problem(404, "not_found", "Not found");
    target.files += from.files;
    from.files = 0;
    commit();
    return json<S["TaskRef"]>({ task_id: newId() }, 202);
  }),

  // Browsing sources

  op("get", "/sources/{source_id}/popular", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    return json(seriesPage(listSeries(source.id), new URL(request.url).searchParams.get("page")));
  }),

  op("get", "/sources/{source_id}/latest", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    if (!source.capabilities.includes("latest"))
      return problem(422, "unsupported", "Not supported", "This source has no latest list.");
    return json(seriesPage([...listSeries(source.id)].reverse(), new URL(request.url).searchParams.get("page")));
  }),

  op("post", "/sources/{source_id}/search", async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    const body = (await request.json()) as S["SourceSearchRequest"];
    const q = (body.query ?? "").toLowerCase();
    const found = listSeries(source.id).filter((series) => series.title.toLowerCase().includes(q));
    return json(seriesPage(found, String(body.page ?? 1)));
  }),

  op("get", "/sources/{source_id}/filters", ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    return json(FILTERS);
  }),

  op("get", "/sources/{source_id}/series", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    const series = sourceSeries(source.id, seriesIndex(new URL(request.url).searchParams.get("key") ?? ""));
    return series ? json(series) : problem(404, "not_found", "Not found");
  }),

  op("get", "/sources/{source_id}/chapters", ({ params, request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const source = usableSource(user, String(params.source_id));
    if (source instanceof Response) return source;
    const i = seriesIndex(new URL(request.url).searchParams.get("key") ?? "");
    if (!sourceSeries(source.id, i)) return problem(404, "not_found", "Not found");
    return json<S["SourceChapterList"]>({ chapters: sourceChapters(source.id, i) });
  }),

  // Jobs

  op("get", "/jobs", () => {
    const admin = requireAdmin();
    return admin instanceof Response ? admin : json<S["JobList"]>({ jobs: db().jobs });
  }),

  op("get", "/jobs/{job_id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const job = db().jobs.find((j) => j.id === params.job_id);
    return job ? json(job) : problem(404, "not_found", "Not found", `No job "${params.job_id}".`);
  }),

  op("get", "/jobs/{job_id}/runs", ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const runs = db()
      .runs.filter((r) => r.summary.job_id === params.job_id && (!status || r.summary.status === status))
      .map((r) => r.summary);
    const { items, next } = paginate(runs, url);
    return json<S["JobRunList"]>({ runs: items, next_page_token: next });
  }),

  op("post", "/jobs/{job_id}/run", async ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const job = d.jobs.find((j) => j.id === params.job_id);
    if (!job) return problem(404, "not_found", "Not found");
    if (job.running) {
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Already running",
          status: 409,
          code: "already_running",
          detail: `the job is running as ${job.current_run_id}`,
          ...(job.current_run_id ? { current_run_id: job.current_run_id } : {}),
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const text = await request.text();
    const given = (text ? (JSON.parse(text) as S["RunJobRequest"]).params : undefined) ?? {};
    const unknown = Object.keys(given).filter((name) => !job.params.some((p) => p.name === name));
    const missing = job.params.filter((p) => p.required && !given[p.name] && !p.default).map((p) => p.name);
    if (unknown.length || missing.length) {
      return problem(
        400,
        "invalid_request",
        "Invalid parameters",
        [...unknown.map((n) => `unknown parameter ${n}`), ...missing.map((n) => `${n} is required`)].join("; "),
      );
    }
    const started = startRun(d, job, given, "manual", admin.username);
    commit();
    return json(started.summary, 202);
  }),

  op("get", "/job-runs/{run_id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const found = db().runs.find((r) => r.summary.id === params.run_id);
    return found ? json(found) : problem(404, "not_found", "Not found");
  }),

  op("post", "/job-runs/{run_id}/cancel", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const d = db();
    const found = d.runs.find((r) => r.summary.id === params.run_id);
    if (!found) return problem(404, "not_found", "Not found");
    if (found.summary.status !== "running") return problem(409, "not_running", "Not running", "The run has finished.");
    const job = d.jobs.find((j) => j.id === found.summary.job_id);
    if (!job?.cancellable) return problem(409, "not_cancellable", "Can't cancel", "This job can't stop midway.");
    finishRun(d, found, "cancelled", `Cancelled by ${admin.username}`);
    commit();
    return json(found.summary, 202);
  }),

  // The task queue

  op("get", "/tasks", ({ request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const state = url.searchParams.get("state");
    const tasks = [...db().tasks]
      .filter((t) => (!kind || t.kind === kind) && (!state || t.state === state))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const { items, next } = paginate(tasks, url);
    return json<S["TaskList"]>({ tasks: items, next_page_token: next });
  }),

  op("get", "/tasks/{task_id}", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const task = db().tasks.find((t) => t.id === params.task_id);
    return task ? json(task) : problem(404, "not_found", "Not found");
  }),

  op("post", "/tasks/{task_id}/cancel", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const task = db().tasks.find((t) => t.id === params.task_id);
    if (!task) return problem(404, "not_found", "Not found");
    if (task.state !== "queued" && task.state !== "running") return problem(409, "task_finished", "Already finished");
    task.state = "cancelled";
    task.finished_at = now();
    delete task.progress;
    taskEvent("task.updated", task);
    commit();
    return json(task);
  }),

  op("post", "/tasks/{task_id}/retry", ({ params }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const task = db().tasks.find((t) => t.id === params.task_id);
    if (!task) return problem(404, "not_found", "Not found");
    if (task.state !== "failed" && task.state !== "cancelled")
      return problem(409, "not_retryable", "Can't retry", "Only failed or cancelled tasks run again.");
    task.state = "queued";
    task.attempts = 0;
    task.run_after = now();
    delete task.last_error;
    delete task.finished_at;
    taskEvent("task.queued", task);
    commit();
    return json(task);
  }),

  op("get", "/queue", () => {
    const admin = requireAdmin();
    return admin instanceof Response ? admin : json(queueState(db()));
  }),

  op("patch", "/queue/kinds/{kind}", async ({ params, request }) => {
    const admin = requireAdmin();
    if (admin instanceof Response) return admin;
    const { paused } = (await request.json()) as S["UpdateQueueKindRequest"];
    const d = db();
    const kind = String(params.kind);
    d.pausedKinds = paused ? [...new Set([...d.pausedKinds, kind])] : d.pausedKinds.filter((k) => k !== kind);
    commit();
    return json(queueState(d));
  }),
];

/** The server checks a plugin seconds after its settings are saved; the mock, sooner. */
const PLUGIN_RECHECK_MS = 300;

/** A check of a plugin, as the server makes after a sync or a settings save. */
function checkPlugin(plugin: S["Plugin"]): void {
  plugin.checked_at = now();
  // Like a plugin that adds stores in the background: one it can't reach shows in its health.
  const stores = (db().pluginConfigs[plugin.id]?.values.stores ?? []) as { url?: string }[];
  const failing = stores.find((store) => store.url?.includes("unreachable"));
  if (failing) {
    plugin.health = "degraded";
    plugin.health_message = `adding store ${failing.url}: can't be reached`;
  } else if (plugin.health === "degraded") {
    plugin.health = "ok";
    delete plugin.health_message;
  }
  commit();
  emit("plugin.health", {
    plugin_id: plugin.id,
    health: plugin.health,
    ...(plugin.health_message ? { health_message: plugin.health_message } : {}),
  });
}

export const handlers = operations.map((operation) => operation.handler);

type MockEventMap = { message: string; ready: string } & { [K in EventType]: string };

/** The event stream, for the browser (tests use a fake EventSource fed by the same events). */
export function createEventsHandler() {
  return sse<MockEventMap>(mockUrl("/events"), ({ client, request }) => {
    client.send({ event: "ready", data: "{}" });
    const off = onMockEvent((type, data) => {
      if (request.signal.aborted) {
        off();
        return;
      }
      try {
        client.send({ event: type as EventType, data: JSON.stringify(data) });
      } catch {
        off(); // the page went away without closing the stream
      }
    });
    request.signal.addEventListener("abort", () => off());
  });
}
