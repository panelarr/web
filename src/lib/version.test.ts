// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { formatVersion } from "./version";

describe("formatVersion", () => {
  it("prefixes release numbers only", () => {
    expect(formatVersion("0.1.0")).toBe("v0.1.0");
    expect(formatVersion("dev")).toBe("dev");
    expect(formatVersion("v2.0.0")).toBe("v2.0.0");
    expect(formatVersion("abc1234")).toBe("abc1234");
  });
});
