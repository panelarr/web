// SPDX-License-Identifier: GPL-3.0-or-later

import { HttpResponse } from "msw";
import type { components } from "@/api/schema.gen";
import { health, systemInfo } from "./data";
import { commit, currentUser, db, newId } from "./db";
import { type MockOperation, op, problem } from "./op";

type S = components["schemas"];

const CSRF = "mock-csrf-token";
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
      grants: {
        may_add: true,
        may_download: false,
        may_manage_matches: false,
        content_rating_ceiling: "suggestive",
        all_sources: true,
        allowed_sources: [],
      },
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
];

export const handlers = operations.map((operation) => operation.handler);
