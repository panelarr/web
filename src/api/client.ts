// SPDX-License-Identifier: GPL-3.0-or-later

import createFetchClient, { type Middleware } from "openapi-fetch";
import createQueryHooks from "openapi-react-query";
import { errorFromResponse, networkError } from "./errors";
import type { paths } from "./schema.gen";

/** The API's base URL, relative to the app's <base href> so a URL base needs no rebuild. */
export function apiBaseUrl(): string {
  return new URL("api/v1", document.baseURI).href;
}

const CSRF_COOKIE = "panelarr_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Sends the CSRF token with every request that changes something: the session cookie
 * alone isn't enough for those.
 */
export const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    if (SAFE_METHODS.has(request.method)) return undefined;
    const token = readCookie(CSRF_COOKIE);
    if (token) request.headers.set("X-CSRF-Token", token);
    return request;
  },
};

/** Turns every failure into an ApiError, so callers and TanStack Query see one shape. */
export const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) throw await errorFromResponse(response);
    return undefined;
  },
  onError({ error }) {
    throw networkError(error);
  },
};

export const api = createFetchClient<paths>({
  baseUrl: apiBaseUrl(),
  credentials: "same-origin",
  // Late-bound so tests (and MSW) can replace the global fetch.
  fetch: (request) => globalThis.fetch(request),
});
api.use(csrfMiddleware, errorMiddleware);

/** TanStack Query hooks for every operation: `$api.useQuery("get", "/system/info")`. */
export const $api = createQueryHooks(api);
