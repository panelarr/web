// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { LibraryEntry } from "@/features/catalog/library-index";
import {
  ADULT,
  activeFilters,
  DEFAULT_VIEW,
  type Filter,
  filterCounts,
  fromDefinition,
  type LibraryView,
  NOT_ADULT,
  ratingCounts,
  type Sort,
  toDefinition,
  valuesIn,
  viewLibrary,
  withoutFilters,
} from "./library-view";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function entry(title: string, more: Partial<Omit<LibraryEntry, "work">> & Partial<LibraryEntry["work"]> = {}) {
  const { type, status, content_rating, ...rest } = more;
  n += 1;
  return {
    work: {
      id: `w${n}`,
      entry_id: `ent_${n}`,
      title,
      content_rating: content_rating ?? "safe",
      attached_sources: 1,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    },
    added_at: hoursAgo(1000),
    new_chapters: 0,
    bookmarks: 0,
    auto_download: false,
    chapters: 10,
    unread: 0,
    downloaded: 0,
    started: false,
    ...rest,
  } satisfies LibraryEntry;
}

const titles = (entries: LibraryEntry[]) => entries.map((e) => e.work.title);
const view = (change: Partial<LibraryView> = {}): LibraryView => ({ ...DEFAULT_VIEW, ...change });
const show = (entries: LibraryEntry[], change: Partial<LibraryView>) => titles(viewLibrary(entries, view(change), NOW));

describe("sorting", () => {
  // A: a new chapter found an hour ago; B: yesterday; C: never since it was added (but a
  // newer upload date than both); D: never, older upload date.
  const a = entry("Alpha", { last_updated_at: hoursAgo(1), latest_chapter_at: hoursAgo(500) });
  const b = entry("Bravo", { last_updated_at: hoursAgo(24), latest_chapter_at: hoursAgo(400) });
  const c = entry("Charlie", { latest_chapter_at: hoursAgo(2) });
  const d = entry("Delta", { latest_chapter_at: hoursAgo(900) });
  const e = entry("Echo");

  it("puts recently updated works first, then those never updated by their latest chapter (AC6)", () => {
    expect(show([d, c, e, b, a], { sort: "updated" })).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  it("flips the whole order when reversed (AC6)", () => {
    expect(show([d, c, e, b, a], { sort: "updated", reverse: true })).toEqual([
      "Echo",
      "Delta",
      "Charlie",
      "Bravo",
      "Alpha",
    ]);
  });

  it("breaks ties by title", () => {
    const same = hoursAgo(5);
    const x = entry("Xenon", { last_updated_at: same });
    const y = entry("Yarrow", { last_updated_at: same });
    expect(show([y, x], { sort: "updated" })).toEqual(["Xenon", "Yarrow"]);
  });

  const cases: Array<[Sort, Partial<LibraryEntry>, Partial<LibraryEntry>, Partial<LibraryEntry>]> = [
    ["added", { added_at: hoursAgo(1) }, { added_at: hoursAgo(2) }, { added_at: hoursAgo(3) }],
    ["read", { last_read_at: hoursAgo(1) }, { last_read_at: hoursAgo(2) }, {}],
    ["latest", { latest_chapter_at: hoursAgo(1) }, { latest_chapter_at: hoursAgo(2) }, {}],
    ["unread", { unread: 9 }, { unread: 5 }, { unread: 0 }],
    ["total", { chapters: 90 }, { chapters: 50 }, { chapters: 1 }],
  ];
  it.each(cases)("sorts by %s, most or newest first, and reversed", (sort, first, second, third) => {
    // Titles against the order, so the sort (not the tie-break) decides.
    const list = [entry("Zulu", first), entry("Mike", second), entry("Alpha", third)];
    expect(show(list, { sort })).toEqual(["Zulu", "Mike", "Alpha"]);
    expect(show(list, { sort, reverse: true })).toEqual(["Alpha", "Mike", "Zulu"]);
  });

  it("sorts by title A–Z, and Z–A reversed", () => {
    const list = [entry("Mike"), entry("alpha"), entry("Zulu")];
    expect(show(list, { sort: "title" })).toEqual(["alpha", "Mike", "Zulu"]);
    expect(show(list, { sort: "title", reverse: true })).toEqual(["Zulu", "Mike", "alpha"]);
  });
});

describe("filters", () => {
  const unreadDownloaded = entry("Unread downloaded", { unread: 3, downloaded: 2, started: true });
  const unreadOnly = entry("Unread only", { unread: 4 });
  const readAll = entry("All read", { started: true, bookmarks: 1 });
  const fresh = entry("Fresh", { unread: 1, new_chapters: 2, started: true });
  const all = [unreadDownloaded, unreadOnly, readAll, fresh];

  const each: Array<[Filter, string[]]> = [
    ["unread", ["Fresh", "Unread downloaded", "Unread only"]],
    ["started", ["All read", "Fresh", "Unread downloaded"]],
    ["downloaded", ["Unread downloaded"]],
    ["bookmarked", ["All read"]],
    ["new", ["Fresh"]],
  ];
  it.each(each)("%s keeps what it matches, or leaves it out", (filter, matching) => {
    expect(show(all, { filters: { [filter]: "include" } })).toEqual(matching);
    expect(show(all, { filters: { [filter]: "exclude" } })).toEqual(
      titles(all)
        .filter((t) => !matching.includes(t))
        .sort(),
    );
  });

  it("combines them: not started; unread, not downloaded (AC7)", () => {
    expect(show(all, { filters: { started: "exclude" } })).toEqual(["Unread only"]);
    expect(show(all, { filters: { unread: "include", downloaded: "exclude" } })).toEqual(["Fresh", "Unread only"]);
  });

  it("counts what each filter matches", () => {
    expect(filterCounts(all)).toEqual({ unread: 3, started: 3, downloaded: 1, bookmarked: 1, new: 1 });
  });

  it("keeps works of the chosen types and statuses", () => {
    const list = [
      entry("A manhwa", { type: "manhwa", status: "releasing" }),
      entry("A manga", { type: "manga", status: "completed" }),
      entry("A webtoon", { type: "webtoon", status: "releasing" }),
      entry("No type"),
    ];
    expect(show(list, { types: ["manhwa"] })).toEqual(["A manhwa"]);
    expect(show(list, { types: ["manhwa", "webtoon"] })).toEqual(["A manhwa", "A webtoon"]);
    expect(show(list, { statuses: ["completed"] })).toEqual(["A manga"]);
    expect(show(list, { types: ["manhwa", "manga"], statuses: ["releasing"] })).toEqual(["A manhwa"]);
  });

  it("offers only the types and statuses in the library, most first, and ones still chosen (AC7)", () => {
    const list = [
      entry("One", { type: "manhwa", status: "releasing" }),
      entry("Two", { type: "manhwa" }),
      entry("Three", { type: "comic" }),
      entry("Four"),
    ];
    expect(valuesIn(list, "type")).toEqual([
      { value: "manhwa", count: 2 },
      { value: "comic", count: 1 },
    ]);
    expect(valuesIn(list, "status", ["hiatus"])).toEqual([
      { value: "releasing", count: 1 },
      { value: "hiatus", count: 0 },
    ]);
  });

  it("keeps works with a new chapter found within the days asked (AC7)", () => {
    const list = [
      entry("Today", { last_updated_at: hoursAgo(3) }),
      entry("Six days", { last_updated_at: hoursAgo(6 * 24) }),
      entry("Eight days", { last_updated_at: hoursAgo(8 * 24) }),
      entry("Never", { latest_chapter_at: hoursAgo(1) }),
    ];
    expect(show(list, { updatedWithinDays: 7 })).toEqual(["Six days", "Today"]);
    expect(show(list, { updatedWithinDays: 1 })).toEqual(["Today"]);
  });

  describe("content ratings", () => {
    const rated = [
      entry("Safe", { content_rating: "safe" }),
      entry("Suggestive", { content_rating: "suggestive" }),
      entry("Erotic", { content_rating: "erotic" }),
      entry("Pornographic", { content_rating: "pornographic" }),
      entry("Unrated", { content_rating: "unknown" }),
    ];
    // A work from an older server, without a rating at all.
    const { content_rating: _, ...bare } = entry("No rating").work;
    const missing = { ...entry("No rating"), work: bare } as unknown as LibraryEntry;

    it("keeps every work without a rating filter", () => {
      expect(show([...rated, missing], { contentRatings: [] })).toHaveLength(6);
    });

    it("hides 18+ and keeps unrated works, or keeps only 18+", () => {
      expect(show([...rated, missing], { contentRatings: NOT_ADULT })).toEqual([
        "No rating",
        "Safe",
        "Suggestive",
        "Unrated",
      ]);
      expect(show([...rated, missing], { contentRatings: ADULT })).toEqual(["Erotic", "Pornographic"]);
      expect(show([...rated, missing], { contentRatings: ["unknown"] })).toEqual(["No rating", "Unrated"]);
    });

    it("offers the ratings up to the ceiling and unrated, in order, with counts", () => {
      const list = [...rated, entry("Also safe"), missing];
      expect(ratingCounts(list, "pornographic")).toEqual([
        { value: "safe", count: 2 },
        { value: "suggestive", count: 1 },
        { value: "erotic", count: 1 },
        { value: "pornographic", count: 1 },
        { value: "unknown", count: 2 },
      ]);
      expect(ratingCounts(list, "suggestive").map((r) => r.value)).toEqual(["safe", "suggestive", "unknown"]);
      // Held by the view from before the ceiling was lowered: listed, to be taken off.
      expect(ratingCounts([], "safe", ["pornographic"])).toEqual([
        { value: "safe", count: 0 },
        { value: "pornographic", count: 0 },
        { value: "unknown", count: 0 },
      ]);
    });
  });

  it("searches on top of the filters", () => {
    expect(show(all, { q: " UNREAD ", filters: { downloaded: "exclude" } })).toEqual(["Unread only"]);
  });

  it("says how many filters are on, and takes them all off", () => {
    const busy = view({
      filters: { unread: "include", new: "exclude" },
      types: ["manga"],
      contentRatings: ["safe"],
      updatedWithinDays: 7,
    });
    expect(activeFilters(busy)).toBe(5);
    const none = withoutFilters({ ...busy, sort: "updated", layout: "list" });
    expect(activeFilters(none)).toBe(0);
    expect(none).toMatchObject({ sort: "updated", layout: "list" });
  });
});

describe("definitions", () => {
  it("round-trips a view through its saved definition", () => {
    const shown = view({
      filters: { unread: "include", started: "exclude" },
      types: ["manhwa"],
      statuses: ["releasing"],
      contentRatings: ["safe", "suggestive", "unknown"],
      updatedWithinDays: 14,
      sort: "updated",
      reverse: true,
      layout: "list",
      unreadBadges: false,
      downloadBadges: true,
      continueButton: false,
    });
    const definition = toDefinition(shown);
    expect(definition).toEqual({
      filters: { unread: "include", started: "exclude" },
      types: ["manhwa"],
      statuses: ["releasing"],
      content_ratings: ["safe", "suggestive", "unknown"],
      updated_within_days: 14,
      sort: "updated",
      reverse: true,
      display: { layout: "list", unread_badges: false, download_badges: true, continue_button: false },
    });
    expect(fromDefinition(definition)).toEqual(shown);
  });

  it("leaves out what doesn't filter, and fills in defaults for what's missing", () => {
    expect(toDefinition(DEFAULT_VIEW)).toEqual({
      sort: "title",
      reverse: false,
      display: { layout: "comfortable", unread_badges: true, download_badges: false, continue_button: true },
    });
    expect(fromDefinition({})).toEqual(DEFAULT_VIEW);
    expect(fromDefinition(undefined)).toEqual(DEFAULT_VIEW);
  });

  it("ignores values it doesn't know (from a newer server)", () => {
    const odd = { filters: { unread: "maybe" }, sort: "rating", display: { layout: "cards" } } as never;
    expect(fromDefinition(odd)).toEqual(DEFAULT_VIEW);
  });

  it("keeps the content ratings it knows, once each, and saves none for an empty list", () => {
    const odd = { content_ratings: ["nsfw", "erotic", "", "pornographic", "erotic", 3] } as never;
    expect(fromDefinition(odd).contentRatings).toEqual(["erotic", "pornographic"]);
    expect(toDefinition(fromDefinition(odd)).content_ratings).toEqual(["erotic", "pornographic"]);
    expect(fromDefinition({ content_ratings: [] }).contentRatings).toEqual([]);
    expect(toDefinition(view({ contentRatings: [] }))).not.toHaveProperty("content_ratings");
  });
});
