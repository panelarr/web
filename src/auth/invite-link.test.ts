// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { inviteLink, tokenFromHash } from "./invite-link";

describe("invite links", () => {
  it("put the token in the fragment and read it back", () => {
    const link = inviteLink("abc+/=", "https://panelarr.example/");
    expect(link).toBe("https://panelarr.example/invite#token=abc%2B%2F%3D");
    expect(tokenFromHash(new URL(link).hash)).toBe("abc+/=");
  });

  it("work under a URL base", () => {
    expect(inviteLink("t", "https://example.org/panelarr/")).toBe("https://example.org/panelarr/invite#token=t");
  });

  it("find no token in an empty fragment", () => {
    expect(tokenFromHash("")).toBeUndefined();
    expect(tokenFromHash("#token=")).toBeUndefined();
  });
});
