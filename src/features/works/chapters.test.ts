// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type Chapter, chapterLabel, chaptersBefore, reasonText } from "./chapters";

const chapter = (id: string, number?: number): Chapter =>
  ({ id, title: `T${id}`, ...(number !== undefined ? { number } : {}) }) as Chapter;

describe("chapter labels", () => {
  it("don't repeat a number the title has", () => {
    expect(chapterLabel({ number: 12, title: "Chapter 12" })).toBe("Chapter 12");
    expect(chapterLabel({ number: 12, volume: "2", title: "The fall" })).toBe("Vol. 2 · Chapter 12 · The fall");
    expect(chapterLabel({ number: 5.5, title: "Chapter 5.5: Side story" })).toBe("Chapter 5.5: Side story");
    expect(chapterLabel({ title: "Extra: Sketches" })).toBe("Extra: Sketches");
  });

  it("explain reasons", () => {
    expect(reasonText("only_source")).toBe("only source");
    expect(reasonText("something_new")).toBe("something new");
  });
});

describe("chaptersBefore", () => {
  it("lists earlier chapters in reading order, extras last", () => {
    const list = [chapter("c", 3), chapter("x"), chapter("a", 1), chapter("b", 2.5)];
    expect(chaptersBefore(list, "c")).toEqual(["a", "b"]);
    expect(chaptersBefore(list, "x")).toEqual(["a", "b", "c"]);
    expect(chaptersBefore(list, "a")).toEqual([]);
  });
});
