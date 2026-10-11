// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "./schema.gen";

export type Problem = components["schemas"]["Problem"];
export type FieldError = components["schemas"]["FieldError"];

/** Status 0: the request never got an answer (offline, server down, CORS, DNS). */
export const NETWORK_ERROR = 0;

/**
 * Every failed API call ends up as an ApiError: an RFC 9457 problem from the server, a
 * response that isn't one (a proxy's error page), or no response at all.
 */
export class ApiError extends Error {
  readonly status: number;
  /** The server's stable, machine-readable code, e.g. `setup_required`; "network" or "http_<status>" otherwise. */
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  readonly fieldErrors: FieldError[];
  /** Seconds to wait, from Retry-After, when rate limited. */
  readonly retryAfter: number | undefined;
  readonly problem: Problem | undefined;

  constructor(init: {
    status: number;
    code: string;
    title: string;
    detail?: string | undefined;
    requestId?: string | undefined;
    fieldErrors?: FieldError[] | undefined;
    retryAfter?: number | undefined;
    problem?: Problem | undefined;
  }) {
    super(init.detail || init.title);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryAfter = init.retryAfter;
    this.problem = init.problem;
  }

  /** The message for one form field, matched on the server's field path. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

const STATUS_TITLES: Record<number, string> = {
  400: "The request wasn't valid",
  401: "You're signed out",
  403: "You aren't allowed to do that",
  404: "Not found",
  409: "That conflicts with the current state",
  413: "That's too large",
  429: "Too many requests",
  500: "The server failed",
  502: "The server couldn't reach a service it needs",
  503: "The server is unavailable",
  504: "The server took too long",
};

function statusTitle(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? "The server failed" : "The request failed");
}

function isProblem(value: unknown): value is Problem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === "string" && typeof v.title === "string";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** Builds the ApiError for a response that isn't OK. Reads the body; don't read it again. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  const status = response.status;
  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
  const text = await response.text().catch(() => "");
  const type = response.headers.get("Content-Type") ?? "";

  if (/json/.test(type) || text.startsWith("{")) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (isProblem(body)) {
      return new ApiError({
        status,
        code: body.code,
        title: body.title,
        detail: body.detail,
        requestId: body.request_id ?? requestId,
        fieldErrors: body.errors,
        retryAfter,
        problem: body,
      });
    }
  }

  // Not a problem document: a proxy's page, a plain-text error, or nothing. Show short
  // plain text as is, never HTML.
  const plain = text.trim();
  const detail = plain && plain.length <= 300 && !/^</.test(plain) ? plain : undefined;
  return new ApiError({ status, code: `http_${status}`, title: statusTitle(status), detail, requestId, retryAfter });
}

/** The error for a request that got no response. Rethrows aborts, which aren't failures. */
export function networkError(cause: unknown): ApiError {
  if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
  return new ApiError({
    status: NETWORK_ERROR,
    code: "network",
    title: "Can't reach the Panelarr server",
    detail: "Check your connection, or whether the server is running.",
  });
}

/** A short, human message for any error, for toasts and alerts. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail || error.title;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}
