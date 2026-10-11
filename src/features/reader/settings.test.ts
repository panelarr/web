// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { defaultsFor, resolve, sanitize } from "./settings";

describe("reader settings", () => {
  it("default by the work's type", () => {
    expect(defaultsFor("manga")).toMatchObject({ mode: "single", direction: "rtl" });
    expect(defaultsFor("manhwa")).toMatchObject({ mode: "webtoon", direction: "ltr", fit: "width" });
    expect(defaultsFor("comic")).toMatchObject({ mode: "single", direction: "ltr" });
    expect(defaultsFor(undefined)).toMatchObject({ mode: "single", direction: "rtl" });
  });

  it("keep only valid stored values", () => {
    expect(
      sanitize({ mode: "webtoon", direction: "up", pageGap: 999, stretch: "yes", unknown: 1, preload: 2.6 }),
    ).toEqual({
      mode: "webtoon",
      pageGap: 64,
      preload: 3,
    });
  });

  it("let the more specific level win, and say where each value comes from", () => {
    const { settings, origin } = resolve("manga", {
      global: { mode: "vertical", background: "black" },
      source: { mode: "single", fit: "width" },
      work: { direction: "ltr" },
    });
    expect(settings).toMatchObject({
      mode: "single",
      fit: "width",
      direction: "ltr",
      background: "black",
      transition: "slide",
    });
    expect(origin).toMatchObject({
      mode: "source",
      fit: "source",
      direction: "work",
      background: "global",
      transition: "default",
    });
  });
});
