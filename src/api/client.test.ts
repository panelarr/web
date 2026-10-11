// SPDX-License-Identifier: GPL-3.0-or-later

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { me } from "@/mocks/data";
import { mockUrl, problem } from "@/mocks/op";
import { server } from "@/test/server";
import { api } from "./client";
import { ApiError } from "./errors";

describe("api client", () => {
  it("sends the CSRF token from the cookie on changes, not on reads", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: the server sets this cookie; the test plays the server
    document.cookie = "panelarr_csrf=token-123; path=/";
    const seen: Record<string, string | null> = {};
    server.use(
      http.get(mockUrl("/me"), ({ request }) => {
        seen.get = request.headers.get("X-CSRF-Token");
        return HttpResponse.json(me);
      }),
      http.post(mockUrl("/auth/logout"), ({ request }) => {
        seen.post = request.headers.get("X-CSRF-Token");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await api.GET("/me");
    await api.POST("/auth/logout");
    expect(seen.get).toBeNull();
    expect(seen.post).toBe("token-123");
  });

  it("throws an ApiError for problem responses", async () => {
    server.use(http.get(mockUrl("/me"), () => problem(401, "unauthenticated", "Unauthenticated")));
    const failure = await api.GET("/me").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("unauthenticated");
    expect((failure as ApiError).status).toBe(401);
  });

  it("throws a network ApiError when there is no response", async () => {
    server.use(http.get(mockUrl("/me"), () => HttpResponse.error()));
    const failure = await api.GET("/me").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(0);
  });
});
