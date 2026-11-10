// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { shouldRetry, shouldRetryOptionalMeta } from "./query-client";

const err = (status: number) => new ApiError({ status, code: "x", title: "x" });

describe("shouldRetry", () => {
  it("retries network failures and server errors, twice at most", () => {
    expect(shouldRetry(0, err(0))).toBe(true);
    expect(shouldRetry(1, err(502))).toBe(true);
    expect(shouldRetry(2, err(502))).toBe(false);
  });

  it("doesn't retry server errors that won't fix themselves", () => {
    const failed = (code: string) => new ApiError({ status: 502, code, title: "x" });
    expect(shouldRetry(0, failed("source_failed"))).toBe(false);
    expect(shouldRetry(0, failed("meta_key_rejected"))).toBe(false);
    expect(shouldRetry(0, failed("http_502"))).toBe(true);
  });

  it("never retries client errors or unknown failures", () => {
    expect(shouldRetry(0, err(400))).toBe(false);
    expect(shouldRetry(0, err(401))).toBe(false);
    expect(shouldRetry(0, err(429))).toBe(false);
    expect(shouldRetry(0, new Error("bug"))).toBe(false);
  });
});

describe("shouldRetryOptionalMeta", () => {
  it("doesn't retry when the metadata service isn't there, and otherwise retries as usual", () => {
    const failed = (code: string) => new ApiError({ status: 503, code, title: "x" });
    expect(shouldRetryOptionalMeta(0, failed("meta_unavailable"))).toBe(false);
    expect(shouldRetryOptionalMeta(0, failed("http_503"))).toBe(true);
    expect(shouldRetryOptionalMeta(2, failed("http_503"))).toBe(false);
    expect(shouldRetryOptionalMeta(0, err(404))).toBe(false);
  });
});
