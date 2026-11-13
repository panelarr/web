// SPDX-License-Identifier: GPL-3.0-or-later

import { $api, apiBaseUrl } from "@/api/client";
import type { components } from "@/api/schema.gen";

export type AuthMethods = components["schemas"]["AuthMethods"];
export type Identity = components["schemas"]["Identity"];

/** How users can sign in (public, also before setup). Changes only when the server restarts. */
export const authMethodsQuery = () => ({ ...$api.queryOptions("get", "/auth/methods"), staleTime: 5 * 60_000 });

/** What an old server, or one that couldn't say, means: passwords for everyone and no single sign-on. */
export const PASSWORD_ONLY: AuthMethods = { password: "all" };

/** Admins: how sign-in is configured (read-only). */
export const systemAuthQuery = () => $api.queryOptions("get", "/system/auth");

/**
 * Leaves the app for another page (the identity provider). Kept on an object so tests can
 * watch it instead of navigating jsdom.
 */
export const browser = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/** Whether a URL the server sent is a web page to go to (never `javascript:` or the like). */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, document.baseURI);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** An app path ("/library") as the server sees it, under the URL base when there is one. */
export function serverPath(appPath: string): string {
  // The same base the router uses (src/router.tsx), without importing the router here.
  const base = new URL(document.baseURI).pathname.replace(/\/$/, "");
  return `${base}${appPath}`;
}

/**
 * Where a browser navigation starts single sign-on: to sign in and come back to `returnTo` (an
 * app path), or to accept an invite with it.
 */
export function ssoStartUrl({ returnTo = "/", invite }: { returnTo?: string; invite?: string } = {}): string {
  const params = new URLSearchParams({ return_to: serverPath(returnTo) });
  if (invite) params.set("invite", invite);
  return `${apiBaseUrl()}/auth/oidc/start?${params}`;
}

/** What each `sso_error` code the server sends back means, in plain words. */
const SSO_ERRORS: Record<string, string> = {
  flow_expired: "The sign-in took too long, or was started in another tab. Try again.",
  state_mismatch: "The answer from the identity provider didn't belong to this sign-in. Try again.",
  provider_error: "The identity provider didn't sign you in.",
  oidc_unavailable: "The identity provider can't be reached right now. Try again later.",
  invalid_token: "The identity provider's answer couldn't be verified. If this keeps happening, tell your admin.",
  nonce_reused: "That sign-in was already used. Try again.",
  not_allowed: "Your login at the identity provider isn't allowed to use Panelarr. Ask an admin.",
  not_linked: "No Panelarr account is linked to this login; ask an admin for an invite.",
  account_disabled: "Your Panelarr account is disabled. Ask an admin.",
  invite_invalid: "The invite was used up or has expired. Ask an admin for a new one.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
  already_linked: "That login is already linked to another Panelarr account.",
  link_exists: "You already have a login at this identity provider linked. Unlink it first.",
  session_changed: "You signed out or switched accounts while linking. Try again.",
  // A start the server refused before going to the provider: it sends the browser back with these.
  invalid_return_to: "The page to come back to wasn't one of Panelarr's. Try again.",
  invalid_request: "That sign-in couldn't be started. Try again.",
  csrf_failed: "Linking couldn't be confirmed as started here. Use Link SSO login on this page.",
  cross_site: "Linking was started from another site, so it was refused. Use Link SSO login on this page.",
  unauthenticated: "Sign in first, then link your login.",
  session_required: "Linking a login needs you signed in here, not an API key.",
};

/** The message for an `sso_error` code; a generic one for codes this app doesn't know. */
export function ssoErrorMessage(code: string): string {
  return Object.hasOwn(SSO_ERRORS, code) ? (SSO_ERRORS[code] as string) : "Signing in with SSO didn't work. Try again.";
}

/** Reads `sso_error` from search params: a short code ("unknown" for anything else), never shown as is. */
export function ssoErrorParam(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value) ? value : "unknown";
}

/** The provider, for people: the issuer's host name (`id.example.com`). */
export function providerName(issuer: string): string {
  try {
    return new URL(issuer).host || issuer;
  } catch {
    return issuer;
  }
}
