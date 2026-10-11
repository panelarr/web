// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { displayName, safeRedirect } from "./session";

describe("safeRedirect", () => {
  it("keeps paths inside the app", () => {
    expect(safeRedirect("/settings?tab=security")).toBe("/settings?tab=security");
  });

  it("refuses other sites and odd paths", () => {
    for (const bad of ["https://example.com", "//example.com", "/\\example.com", "settings", undefined, 42]) {
      expect(safeRedirect(bad)).toBe("/");
    }
  });

  it("never sends back to a sign-in page", () => {
    expect(safeRedirect("/login?redirect=/x")).toBe("/");
    expect(safeRedirect("/setup")).toBe("/");
  });
});

describe("displayName", () => {
  it("prefers the display name", () => {
    expect(displayName({ display_name: "Ann", username: "ann" })).toBe("Ann");
    expect(displayName({ display_name: "", username: "ann" })).toBe("ann");
  });
});
