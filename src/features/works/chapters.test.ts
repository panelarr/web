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

  it("use the server's cleaned-up name when there is one", () => {
    const named = { number: 1, volume: "1", title: "Vol. 1 Volume 1 Chapter 1: Double Dungeon" };
    expect(chapterLabel({ ...named, display_title: "Double Dungeon" })).toBe("Vol. 1 · Chapter 1: Double Dungeon");
    expect(chapterLabel({ number: 192, title: "Chapter 192", display_title: "" })).toBe("Chapter 192");
    expect(chapterLabel({ title: "Side Story: The Lake", display_title: "" })).toBe("Side Story: The Lake");
    expect(chapterLabel({ title: "Side Story: The Lake", display_title: "The Lake" })).toBe("The Lake");
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
