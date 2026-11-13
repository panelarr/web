// SPDX-License-Identifier: GPL-3.0-or-later

// Single sign-on in the mock server: the settings the server would read from its environment,
// the linked logins, and a made-up identity provider ("Example ID") with a few logins. Starting
// a sign-in is a browser navigation, which the mock service worker never sees, so in the browser
// `src/mocks/provider-pages.ts` plays the server's start and callback and the provider's page.
import type { components } from "@/api/schema.gen";
import type { MockDb } from "./db";
import { type MockOperation, op, problem } from "./op";

type S = components["schemas"];

export type MockIdentity = S["Identity"] & { user_id: string };

/** What `PANELARR_OIDC_*` would say. */
export interface MockOidc {
  issuer: string;
  client_id: string;
  label: string;
  password: "all" | "admins";
  logout: "local" | "provider";
  auto_provision: boolean;
  allowed_groups: string[];
  admin_groups: string[];
  reachable: boolean;
}

export const ISSUER = "https://id.example.com";

/** Who can sign in at the made-up provider. */
export interface ProviderLogin {
  subject: string;
  username: string;
  name: string;
  email: string;
  groups: string[];
}

export const PROVIDER_LOGINS: readonly ProviderLogin[] = [
  {
    subject: "example-admin",
    username: "admin",
    name: "Admin",
    email: "admin@example.com",
    groups: ["panelarr-admins"],
  },
  { subject: "example-reader", username: "reader", name: "Reader", email: "reader@example.com", groups: ["readers"] },
  { subject: "example-casey", username: "casey", name: "Casey", email: "casey@example.com", groups: ["readers"] },
  {
    subject: "example-newcomer",
    username: "newcomer",
    name: "Newcomer",
    email: "newcomer@example.com",
    groups: ["readers"],
  },
];

/** A user created by single sign-on: no password. */
export const ssoUser = {
  id: "6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b",
  username: "casey",
  display_name: "Casey",
  role: "user",
  disabled: false,
  grants: {
    may_add: true,
    may_download: false,
    may_manage_matches: false,
    content_rating_ceiling: "suggestive",
    all_sources: true,
    allowed_sources: [],
  },
  created_at: "2026-10-20T10:00:00Z",
  last_login_at: "2026-10-21T19:00:00Z",
} satisfies S["User"];

export function initialOidc(overrides: Partial<MockOidc> = {}): MockOidc {
  return {
    issuer: ISSUER,
    client_id: "panelarr",
    label: "Sign in with Example ID",
    password: "all",
    logout: "provider",
    auto_provision: false,
    allowed_groups: [],
    admin_groups: ["panelarr-admins"],
    reachable: true,
    ...overrides,
  };
}

/** The reader and Casey have linked logins; the admin hasn't. */
export function initialIdentities(readerId: string): MockIdentity[] {
  return [
    {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      user_id: readerId,
      issuer: ISSUER,
      subject: "example-reader",
      email: "reader@example.com",
      created_at: "2026-10-12T09:00:00Z",
      last_login_at: "2026-10-14T20:15:00Z",
    },
    {
      id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      user_id: ssoUser.id,
      issuer: ISSUER,
      subject: "example-casey",
      email: "casey@example.com",
      created_at: "2026-10-20T10:00:00Z",
      last_login_at: "2026-10-21T19:00:00Z",
    },
  ];
}

export function authMethods(d: MockDb): S["AuthMethods"] {
  return d.oidc ? { password: d.oidc.password, oidc: { label: d.oidc.label } } : { password: "all" };
}

export function systemAuth(d: MockDb): S["SystemAuth"] {
  const oidc = d.oidc;
  if (!oidc) return { password: "all", oidc: { enabled: false } };
  return {
    password: oidc.password,
    oidc: {
      enabled: true,
      issuer: oidc.issuer,
      client_id: oidc.client_id,
      public_client: false,
      reachable: oidc.reachable,
      ...(oidc.reachable ? {} : { error: "discovery: connection refused" }),
      scopes: ["openid", "profile", "email", "groups"],
      button_label: oidc.label,
      username_claim: "preferred_username",
      groups_claim: "groups",
      auto_provision: oidc.auto_provision,
      allowed_groups: oidc.allowed_groups,
      admin_groups: oidc.admin_groups,
      logout: oidc.logout,
    },
  };
}

const view = ({ user_id: _user, ...identity }: MockIdentity): S["Identity"] => identity;

/** Whether the user could still sign in without this identity (the server's `last_login_method` rule). */
function hasOtherWayIn(d: MockDb, user: S["User"], identityId: string): boolean {
  if (d.identities.some((i) => i.user_id === user.id && i.id !== identityId)) return true;
  const password = d.passwords[user.username.toLowerCase()] !== undefined;
  return password && (d.oidc?.password !== "admins" || user.role === "admin");
}

function unlink(d: MockDb, user: S["User"], identityId: string, who: "you" | "they") {
  const identity = d.identities.find((i) => i.id === identityId && i.user_id === user.id);
  if (!identity) return problem(404, "not_found", "Not found");
  if (!hasOtherWayIn(d, user, identityId)) {
    return problem(
      409,
      "last_login_method",
      "Last way to sign in",
      who === "you"
        ? "Set a password before unlinking your only login."
        : "Set a password for this user first, or disable them.",
    );
  }
  d.identities = d.identities.filter((i) => i !== identity);
  return new Response(null, { status: 204 });
}

/** A path on this server outside the API, as the server checks `return_to`. */
export function validReturnTo(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/^\/api(\/|$)/.test(new URL(value, "http://x").pathname)
  );
}

/** What the server's `GET /auth/oidc/start` sees: its query and who is signed in. */
export interface MockStart {
  return_to: string | null;
  intent: string | null;
  invite: string | null;
  csrf_token: string | null;
}

/**
 * The server's `GET /auth/oidc/start` checks, in its order: `"provider"` to go on, `"problem"`
 * when single sign-on isn't configured (still a 404), or the page a refused browser navigation
 * is sent to instead.
 */
export function checkStart(d: MockDb, start: MockStart): { go: string } {
  if (!d.oidc) return { go: "problem" };
  const returnTo = start.return_to ?? "/";
  const refuse = (code: string) => ({ go: startRefusalPage(start, code) });
  if (!validReturnTo(returnTo)) return refuse("invalid_return_to");
  if (start.intent === "link") {
    if (start.invite) return refuse("invalid_request");
    if (!d.users.some((u) => u.id === d.currentUserId)) return refuse("unauthenticated");
    if (start.csrf_token !== "mock-csrf-token") return refuse("csrf_failed");
  } else if (
    start.invite &&
    !d.invites.some((i) => i.token === start.invite && Date.parse(i.expires_at) > Date.now())
  ) {
    return refuse("invite_invalid");
  }
  if (!d.oidc.reachable) return refuse("oidc_unavailable");
  return { go: "provider" };
}

/**
 * As the server: a link goes back to its (valid) `return_to` with `sso_error`; anything else to
 * the login page, keeping a valid `return_to` other than `/` as `redirect` for "Try again".
 */
export function startRefusalPage(start: Pick<MockStart, "return_to" | "intent">, code: string): string {
  const returnTo = start.return_to !== null && validReturnTo(start.return_to) ? start.return_to : undefined;
  if (returnTo !== undefined && start.intent === "link") return withError(returnTo, code);
  const query = new URLSearchParams({ sso_error: code });
  if (returnTo !== undefined && returnTo !== "/") query.set("redirect", returnTo);
  return `/login?${query}`;
}

/** Where the made-up provider's pages live in the dev server (served by `src/mocks/browser.ts`). */
export function mockProviderUrl(page: "authorize" | "end-session", params: Record<string, string>): string {
  return `${new URL(`mock-provider/${page}`, document.baseURI).href}?${new URLSearchParams(params)}`;
}

export function oidcOperations(
  requireUser: () => S["User"] | Response,
  requireAdmin: () => S["User"] | Response,
  db: () => MockDb,
  commit: () => void,
): MockOperation[] {
  const notConfigured = () => problem(404, "not_found", "Not found", "Single sign-on isn't configured.");
  return [
    op("get", "/auth/methods", () => Response.json(authMethods(db()))),

    op("post", "/auth/oidc/link", async ({ request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const d = db();
      if (!d.oidc) return notConfigured();
      if (!d.oidc.reachable) return problem(503, "oidc_unavailable", "Unavailable", "The provider can't be reached.");
      const text = await request.text();
      const body = (text ? JSON.parse(text) : {}) as S["OidcLinkRequest"];
      const returnTo = body.return_to ?? "/";
      if (!validReturnTo(returnTo)) {
        return problem(400, "invalid_return_to", "Invalid return_to", "return_to must be a path on this server.");
      }
      return Response.json({
        redirect_to: mockProviderUrl("authorize", { intent: "link", return_to: returnTo }),
      } satisfies S["OidcLinkStart"]);
    }),

    op("get", "/me/identities", () => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const identities = db()
        .identities.filter((i) => i.user_id === user.id)
        .map(view);
      return Response.json({ identities } satisfies S["IdentityList"]);
    }),

    op("delete", "/me/identities/{id}", ({ params }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const response = unlink(db(), user, String(params.id), "you");
      commit();
      return response;
    }),

    op("get", "/users/{id}/identities", ({ params }) => {
      const admin = requireAdmin();
      if (admin instanceof Response) return admin;
      const d = db();
      if (!d.users.some((u) => u.id === params.id)) return problem(404, "not_found", "Not found");
      const identities = d.identities.filter((i) => i.user_id === params.id).map(view);
      return Response.json({ identities } satisfies S["IdentityList"]);
    }),

    op("delete", "/users/{id}/identities/{identity_id}", ({ params }) => {
      const admin = requireAdmin();
      if (admin instanceof Response) return admin;
      const d = db();
      const user = d.users.find((u) => u.id === params.id);
      if (!user) return problem(404, "not_found", "Not found");
      const response = unlink(d, user, String(params.identity_id), "they");
      commit();
      return response;
    }),

    op("get", "/system/auth", () => {
      const admin = requireAdmin();
      if (admin instanceof Response) return admin;
      return Response.json(systemAuth(db()));
    }),
  ];
}

/** A single sign-on flow in progress: what the server keeps in its encrypted cookie. */
export interface MockFlow {
  intent: "login" | "link";
  return_to: string;
  invite?: string;
}

function withError(path: string, code: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}sso_error=${code}`;
}

/**
 * The server's callback (its rules in order), after the provider signed `login` in, or
 * refused (`undefined`). Returns where the browser goes next.
 */
export function finishFlow(
  d: MockDb,
  flow: MockFlow,
  login: ProviderLogin | undefined,
  signIn: (user: S["User"]) => void,
): string {
  const fail = (code: string) => withError(flow.intent === "link" ? flow.return_to : "/login", code);
  const oidc = d.oidc;
  if (!oidc) return "/login";
  if (!login) return fail("provider_error");
  if (oidc.allowed_groups.length > 0 && !login.groups.some((g) => oidc.allowed_groups.includes(g))) {
    return fail("not_allowed");
  }
  const now = new Date().toISOString();
  const linked = d.identities.find((i) => i.issuer === oidc.issuer && i.subject === login.subject);

  if (flow.intent === "link") {
    const current = d.users.find((u) => u.id === d.currentUserId);
    if (!current) return fail("session_changed");
    if (linked && linked.user_id !== current.id) return fail("already_linked");
    if (!linked && d.identities.some((i) => i.user_id === current.id && i.issuer === oidc.issuer)) {
      return fail("link_exists");
    }
    if (!linked) {
      d.identities.push({
        id: crypto.randomUUID(),
        user_id: current.id,
        issuer: oidc.issuer,
        subject: login.subject,
        email: login.email,
        created_at: now,
      });
    }
    return flow.return_to;
  }

  let user: S["User"] | undefined;
  if (linked) {
    user = d.users.find((u) => u.id === linked.user_id);
    if (!user) return fail("not_linked");
    if (user.disabled) return fail("account_disabled");
    linked.last_login_at = now;
    linked.email = login.email;
  } else if (flow.invite !== undefined) {
    const invite = d.invites.find((i) => i.token === flow.invite && Date.parse(i.expires_at) > Date.now());
    if (!invite) return fail("invite_invalid");
    user = createUser(d, login, invite.role, invite.grants);
    d.invites = d.invites.filter((i) => i !== invite);
  } else if (oidc.auto_provision) {
    user = createUser(d, login, "user", undefined);
  } else {
    return fail("not_linked");
  }
  if (!linked) {
    d.identities.push({
      id: crypto.randomUUID(),
      user_id: user.id,
      issuer: oidc.issuer,
      subject: login.subject,
      email: login.email,
      created_at: now,
      last_login_at: now,
    });
  }
  // Roles follow the admin groups, but the last enabled admin is never demoted.
  if (oidc.admin_groups.length > 0) {
    const admin = login.groups.some((g) => oidc.admin_groups.includes(g));
    const others = d.users.filter((u) => u.role === "admin" && !u.disabled && u.id !== user.id);
    if (admin) user.role = "admin";
    else if (user.role === "admin" && others.length > 0) user.role = "user";
  }
  signIn(user);
  return flow.return_to;
}

function createUser(d: MockDb, login: ProviderLogin, role: S["Role"], grants: S["Grants"] | undefined): S["User"] {
  const taken = (name: string) => d.users.some((u) => u.username.toLowerCase() === name.toLowerCase());
  let username = login.username;
  for (let n = 2; taken(username); n++) username = `${login.username}-${n}`;
  const user: S["User"] = {
    id: crypto.randomUUID(),
    username,
    display_name: login.name,
    role,
    disabled: false,
    grants: grants ?? { ...ssoUser.grants },
    created_at: new Date().toISOString(),
  };
  d.users.push(user);
  return user;
}
