// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { shouldRetry } from "./query-client";

const err = (status: number) => new ApiError({ status, code: "x", title: "x" });

describe("shouldRetry", () => {
  it("retries network failures and server errors, twice at most", () => {
    expect(shouldRetry(0, err(0))).toBe(true);
    expect(shouldRetry(1, err(502))).toBe(true);
    expect(shouldRetry(2, err(502))).toBe(false);
  });

  it("never retries client errors or unknown failures", () => {
    expect(shouldRetry(0, err(400))).toBe(false);
    expect(shouldRetry(0, err(401))).toBe(false);
    expect(shouldRetry(0, err(429))).toBe(false);
    expect(shouldRetry(0, new Error("bug"))).toBe(false);
  });
});
