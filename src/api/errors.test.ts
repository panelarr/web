// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ApiError, errorFromResponse, errorMessage, isApiError, networkError } from "./errors";

function problemResponse(body: object, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 400,
    ...init,
    headers: { "Content-Type": "application/problem+json", ...init.headers },
  });
}

describe("errorFromResponse", () => {
  it("reads the server's problem details", async () => {
    const error = await errorFromResponse(
      problemResponse(
        {
          type: "about:blank",
          title: "Invalid request",
          status: 400,
          code: "invalid_request",
          detail: "The username is taken.",
          request_id: "req-1",
          errors: [{ field: "username", message: "is taken" }],
        },
        { headers: { "X-Request-Id": "header-id" } },
      ),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe("The username is taken.");
    expect(error.requestId).toBe("req-1");
    expect(error.fieldError("username")).toBe("is taken");
    expect(error.fieldError("password")).toBeUndefined();
  });

  it("falls back to the X-Request-Id header and reads Retry-After", async () => {
    const error = await errorFromResponse(
      problemResponse(
        { type: "about:blank", title: "Too many requests", status: 429, code: "rate_limited" },
        { status: 429, headers: { "X-Request-Id": "header-id", "Retry-After": "30" } },
      ),
    );
    expect(error.code).toBe("rate_limited");
    expect(error.requestId).toBe("header-id");
    expect(error.retryAfter).toBe(30);
    expect(error.message).toBe("Too many requests");
  });

  it("never shows a proxy's HTML page", async () => {
    const error = await errorFromResponse(
      new Response("<html><body><h1>502 Bad Gateway</h1></body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );
    expect(error.code).toBe("http_502");
    expect(error.detail).toBeUndefined();
    expect(error.message).toBe("The server couldn't reach a service it needs");
  });

  it("shows short plain text as is", async () => {
    const error = await errorFromResponse(new Response("upstream timed out", { status: 504 }));
    expect(error.code).toBe("http_504");
    expect(error.message).toBe("upstream timed out");
  });

  it("handles JSON that isn't a problem", async () => {
    const error = await errorFromResponse(
      new Response(JSON.stringify({ error: "nope" }), { status: 404, headers: { "Content-Type": "application/json" } }),
    );
    expect(error.code).toBe("http_404");
    expect(error.title).toBe("Not found");
  });
});

describe("networkError", () => {
  it("is status 0 with a helpful message", () => {
    const error = networkError(new TypeError("Failed to fetch"));
    expect(error.status).toBe(0);
    expect(error.code).toBe("network");
    expect(errorMessage(error)).toMatch(/connection/);
  });

  it("rethrows aborts", () => {
    expect(() => networkError(new DOMException("aborted", "AbortError"))).toThrow(DOMException);
  });
});

describe("isApiError", () => {
  it("matches on the code", () => {
    const error = new ApiError({ status: 409, code: "setup_required", title: "Setup required" });
    expect(isApiError(error)).toBe(true);
    expect(isApiError(error, "setup_required")).toBe(true);
    expect(isApiError(error, "forbidden")).toBe(false);
    expect(isApiError(new Error("x"))).toBe(false);
  });
});
