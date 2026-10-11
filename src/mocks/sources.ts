// SPDX-License-Identifier: GPL-3.0-or-later

// What the mock sources list: series built from the made-up catalogue (each source names
// them a little differently, as real sources do), chapters, and a set of search filters
// covering every filter kind.
import type { components } from "@/api/schema.gen";
import { CATALOG } from "./catalog";

type S = components["schemas"];

/** Per source: which catalogue entries it has, and how it names them. */
const NAMING: Record<string, (entry: S["CatalogEntry"]) => string> = {
  "example:1001": (e) => e.title,
  "example:1002": (e) => e.titles.find((t) => t.kind === "romanized")?.text ?? e.title,
  "example:1003": (e) => e.titles.find((t) => t.kind === "native")?.text ?? e.title,
};

function has(sourceId: string, i: number): boolean {
  if (sourceId === "example:1001") return i % 5 !== 4;
  if (sourceId === "example:1002") return i % 2 === 0;
  return i % 3 === 0;
}

export function seriesKey(i: number): string {
  return `/series/${1000 + i}`;
}

export function seriesIndex(key: string): number {
  return Number(key.replace("/series/", "")) - 1000;
}

export function sourceSeries(sourceId: string, i: number): S["SourceSeries"] | undefined {
  const entry = CATALOG[i];
  const name = NAMING[sourceId];
  if (!entry || !name || !has(sourceId, i)) return undefined;
  return {
    key: seriesKey(i),
    title: name(entry),
    alt_titles: [],
    // Sample Scans lists no people, as many sites don't.
    authors: sourceId === "example:1002" ? [] : entry.credits.filter((c) => c.role === "author").map((c) => c.name),
    artists: sourceId === "example:1002" ? [] : entry.credits.filter((c) => c.role === "artist").map((c) => c.name),
    description: "A series on a made-up source.",
    genres: entry.genres,
    status: entry.status === "completed" ? "completed" : "ongoing",
    cover_url: entry.cover?.url ?? "",
    url: `https://example.com/${sourceId.split(":")[1]}/series/${1000 + i}`,
  };
}

export function listSeries(sourceId: string): S["SourceSeries"][] {
  return CATALOG.map((_, i) => sourceSeries(sourceId, i)).filter((s): s is S["SourceSeries"] => s !== undefined);
}

/** A source's chapters for a series: numbered, some decimals, an extra, newest first. */
export function sourceChapters(sourceId: string, i: number): S["SourceChapter"][] {
  const count = 8 + ((i * 3) % 9) + (sourceId === "example:1001" ? 4 : 0);
  const chapters: S["SourceChapter"][] = [];
  for (let n = 1; n <= count; n++) {
    chapters.push({
      key: `${seriesKey(i)}/ch/${n}`,
      name: `Chapter ${n}`,
      number: n,
      volume: String(Math.ceil(n / 8)),
      scanlator: sourceId === "example:1002" ? "Sample Scans Team" : "Official",
      uploaded_at: new Date(Date.UTC(2026, 0, 1) + n * 7 * 86_400_000).toISOString(),
      lang: sourceId === "example:1003" ? "ja" : "en",
    });
    if (n === 5 && sourceId !== "example:1003") {
      chapters.push({ key: `${seriesKey(i)}/ch/5.5`, name: "Chapter 5.5: Side story", number: 5.5, lang: "en" });
    }
  }
  chapters.push({ key: `${seriesKey(i)}/extra`, name: "Extra: Character sketches", lang: "en" });
  return chapters.reverse();
}

/** Every filter kind, in the contract's JSON form (as the server passes it on). */
export const FILTERS: S["SourceFilters"] = {
  filters: [
    { name: "Filters apply to search only", header: {} },
    { name: "Author", text: {} },
    { name: "Status", select: { options: ["Any", "Ongoing", "Completed"] } },
    { name: "Sort by", sort: { options: ["Popular", "Latest", "Title"], selection: { index: 0 } } },
    { name: "", separator: {} },
    { name: "Completed only", checkbox: {} },
    {
      name: "Genres",
      group: {
        filters: [
          { name: "Action", triState: {} },
          { name: "Comedy", triState: {} },
          { name: "Drama", triState: { value: "TRI_STATE_EXCLUDE" } },
        ],
      },
    },
  ],
};
