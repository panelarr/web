// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { isSpread, pairPages, viewOf } from "./spreads";

describe("double pages", () => {
  const none = () => false;

  it("pair pages two by two", () => {
    expect(pairPages(5, none, false)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("show the cover alone with the offset", () => {
    expect(pairPages(5, none, true)).toEqual([[0], [1, 2], [3, 4]]);
  });

  it("keep spreads alone, and the page before one", () => {
    const spread = (i: number) => i === 3;
    expect(pairPages(7, spread, false)).toEqual([[0, 1], [2], [3], [4, 5], [6]]);
    expect(pairPages(7, spread, true)).toEqual([[0], [1, 2], [3], [4, 5], [6]]);
  });

  it("find the view of a page, and the ends", () => {
    const views = pairPages(5, none, true);
    expect(viewOf(views, 2)).toBe(1);
    expect(viewOf(views, -1)).toBe(-1);
    expect(viewOf(views, 5)).toBe(3);
  });

  it("call wide pages spreads", () => {
    expect(isSpread({ width: 1600, height: 1150 })).toBe(true);
    expect(isSpread({ width: 800, height: 1150 })).toBe(false);
    expect(isSpread(undefined)).toBe(false);
  });
});
