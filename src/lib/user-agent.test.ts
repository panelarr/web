// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      "Chrome on macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
      "Safari on iOS",
    ],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox on Windows"],
    [
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 EdgA/141.0 Edg/141.0",
      "Edge on Android",
    ],
    ["curl/8.9.1", "curl/8.9.1"],
    [undefined, "Unknown device"],
  ])("%s → %s", (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected);
  });
});
