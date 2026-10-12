// SPDX-License-Identifier: GPL-3.0-or-later

import { $api, readCookie } from "@/api/client";
import type { components } from "@/api/schema.gen";

export type User = components["schemas"]["User"];
export type Me = components["schemas"]["Me"];

/** The signed-in user. Fails with `unauthenticated` when signed out, `setup_required` on a new install. */
export const meQuery = () => $api.queryOptions("get", "/me");
/** Where the first-run wizard stands. Needs no sign-in. */
export const setupQuery = () => $api.queryOptions("get", "/setup");
export const systemInfoQuery = () => $api.queryOptions("get", "/system/info");

const CSRF_COOKIE = "panelarr_csrf";

/**
 * Whether this browser probably has a session: the server sets the readable CSRF cookie with
 * the (unreadable) session cookie, with the same lifetime, and clears both on sign-out. Without
 * it there's no point asking the server who we are (that answer would be a 401).
 */
export function hasSessionHint(): boolean {
  return readCookie(CSRF_COOKIE) !== undefined;
}

/** Forgets the hint once the server says the session is gone, so sign-in doesn't ask again. */
export function clearSessionHint(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: removing the server's readable cookie, by design
  document.cookie = `${CSRF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Pages anyone may open, signed in or not. */
export const PUBLIC_PATHS = ["/login", "/setup", "/invite"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Where to go after signing in: only a path inside the app (never another site, never back
 * to a sign-in page).
 */
export function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return "/";
  }
  return isPublicPath(target.split(/[?#]/)[0] ?? "") ? "/" : target;
}

export function displayName(user: Pick<User, "display_name" | "username">): string {
  return user.display_name || user.username;
}

export function useMe(): Me {
  return $api.useSuspenseQuery("get", "/me").data;
}

export function useIsAdmin(): boolean {
  return useMe().user.role === "admin";
}
