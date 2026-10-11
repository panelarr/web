// SPDX-License-Identifier: GPL-3.0-or-later

import { HttpResponse } from "msw";
import type { components } from "@/api/schema.gen";
import { CATALOG, coverSvg, summary, withinCeiling } from "./catalog";
import { health, systemInfo } from "./data";
import { commit, currentUser, db, type MockInvite, newId } from "./db";
import { type MockOperation, op, problem } from "./op";

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
    found.checked_at = now();
    commit();
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
    // Secret fields come back empty; leaving them empty keeps the stored value.
    config.values = { ...values, api_token: "" };
    commit();
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
      return [{ entry: summary(entry, i), ...(title.text !== entry.title ? { matched: title.text } : {}) }];
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
    const all = visibleCatalog(user, url).map(([entry, i]) => summary(entry, i));
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
    return json(entry);
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
        return [{ work, added_at: e.added_at, new_chapters: e.new_chapters }];
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
    const i = CATALOG.findIndex((e) => e.id === body.entry_id);
    const entry = CATALOG[i];
    if (!entry) return problem(404, "not_found", "Not found");
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
    }
    const existing = d.library.find((e) => e.user_id === user.id && e.work_id === work.id);
    if (existing)
      return json<S["LibraryEntry"]>({ work, added_at: existing.added_at, new_chapters: existing.new_chapters });
    const added = { user_id: user.id, work_id: work.id, added_at: now(), new_chapters: 0 };
    d.library.push(added);
    commit();
    return json<S["LibraryEntry"]>({ work, added_at: added.added_at, new_chapters: 0 }, 201);
  }),
];

export const handlers = operations.map((operation) => operation.handler);
