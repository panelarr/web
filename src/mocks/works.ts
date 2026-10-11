// SPDX-License-Identifier: GPL-3.0-or-later

// Works and matching for the mock server: each added work is matched on the sources a step
// at a time, ending matched, with candidates to confirm, or without a match.
import type { components } from "@/api/schema.gen";
import { CATALOG } from "./catalog";
import { emit } from "./events";
import { listSeries, seriesIndex, seriesKey, sourceChapters, sourceSeries } from "./sources";

type S = components["schemas"];

export interface WorksState {
  works: S["WorkSummary"][];
  sources: S["SourceInfo"][];
  /** Per work: its matching state on each source. */
  matching: Record<string, S["WorkSourceState"][]>;
}

/** The same UUID for the same text, so a series keeps its ID across mock calls. */
export function stableUuid(text: string): string {
  let hex = "";
  for (let round = 0; hex.length < 32; round++) {
    let h = 2166136261 ^ round;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function entryIndex(entryId: string): number {
  return CATALOG.findIndex((e) => e.id === entryId);
}

function titleScore(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  const words = new Set(x.split(/\s+/));
  const shared = y.split(/\s+/).filter((w) => words.has(w)).length;
  return Math.round((shared / Math.max(words.size, 1)) * 100) / 100;
}

export function matchSeries(
  sourceId: string,
  i: number,
  forEntry: number,
  state: S["MatchSeries"]["state"],
  origin: S["MatchSeries"]["origin"],
): S["MatchSeries"] | undefined {
  const series = sourceSeries(sourceId, i);
  const entry = CATALOG[forEntry];
  if (!series || !entry) return undefined;
  const best = entry.titles
    .map((t) => ({ text: t.text, score: titleScore(t.text, series.title) }))
    .sort((a, b) => b.score - a.score)[0];
  const authors = entry.credits.filter((c) => c.role === "author").map((c) => c.name);
  return {
    id: stableUuid(`${sourceId}|${series.key}|${forEntry}`),
    source_id: sourceId,
    key: series.key,
    title: series.title,
    ...(series.url ? { url: series.url } : {}),
    ...(series.cover_url ? { cover_url: series.cover_url } : {}),
    state,
    origin,
    score: best?.score ?? 0,
    priority: 0,
    evidence: {
      entry_title: entry.title,
      ...(best ? { matched_title: best.text } : {}),
      query: best?.text ?? entry.title,
      title_score: best?.score ?? 0,
      authors_match: series.authors.some((a) => authors.includes(a)),
      source_authors: series.authors,
      chapter_count: sourceChapters(sourceId, i).length,
    },
  };
}

/** Starts matching a new work on every enabled source. */
export function startMatching(state: WorksState, work: S["WorkSummary"]): void {
  state.matching[work.id] = state.sources
    .filter((source) => source.enabled && source.present)
    .map((source) => ({ source, status: "pending", queries: [], candidates: [] }));
}

/** Finishes pending matching: the browser calls it on a timer, tests by hand. */
export function tickMatching(state: WorksState): boolean {
  let changed = false;
  for (const work of state.works) {
    const i = entryIndex(work.entry_id);
    const entry = CATALOG[i];
    const list = state.matching[work.id] ?? [];
    for (const row of list) {
      if (row.status !== "pending" || !entry) continue;
      changed = true;
      row.queries = entry.titles.map((t) => t.text);
      row.checked_at = new Date().toISOString();
      const own = sourceSeries(row.source.id, i);
      if (row.source.health.status === "failing") {
        row.status = "failed";
        row.message = row.source.health.message ?? "The source failed.";
        row.queries = [entry.title];
      } else if (own && row.source.id === "example:1001") {
        row.status = "matched";
        row.queries = [entry.title];
        row.attached = matchSeries(row.source.id, i, i, "attached", "auto");
      } else if (own) {
        row.status = "candidates";
        const other = (i + 2) % CATALOG.length;
        row.candidates = [
          matchSeries(row.source.id, i, i, "candidate", "auto"),
          matchSeries(row.source.id, other, i, "candidate", "auto"),
        ].filter((c): c is S["MatchSeries"] => c !== undefined);
      } else {
        row.status = "no_match";
      }
    }
    work.attached_sources = list.filter((row) => row.attached).length;
  }
  if (changed) for (const work of state.works) emit("work.updated", { work_id: work.id });
  return changed;
}

/** Finds a series by a URL on one of the mock sources ("https://example.com/1001/series/1004"). */
export function resolveUrl(url: string): { source_id: string; key: string } | undefined {
  const match = /^https:\/\/example\.(?:com|org|net)\/(\d+)\/series\/(\d+)$/.exec(url.trim());
  if (!match) return undefined;
  const sourceId = `example:${match[1]}`;
  const i = Number(match[2]) - 1000;
  return sourceSeries(sourceId, i) ? { source_id: sourceId, key: seriesKey(i) } : undefined;
}

/** The catalogue entries a source series might be, best first (for adding from a source). */
export function entryCandidates(sourceId: string, key: string): S["EntryCandidate"][] {
  const series = sourceSeries(sourceId, seriesIndex(key));
  if (!series) return [];
  return CATALOG.map((entry) => {
    const best = entry.titles
      .map((t) => ({ text: t.text, score: titleScore(t.text, series.title) }))
      .sort((a, b) => b.score - a.score)[0];
    const authors = entry.credits.filter((c) => c.role === "author").map((c) => c.name);
    return {
      entry,
      score: best?.score ?? 0,
      matched: best?.text ?? entry.title,
      authors: series.authors.some((a) => authors.includes(a)),
    };
  })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ entry, score, matched, authors }) => ({
      entry: {
        id: entry.id,
        title: entry.title,
        ...(entry.type ? { type: entry.type } : {}),
        content_rating: entry.content_rating,
        ...(entry.year ? { year: entry.year } : {}),
        ...(entry.cover ? { cover: entry.cover } : {}),
        genres: entry.genres,
        attribution: entry.attribution,
      },
      score,
      matched_title: matched,
      authors_match: authors,
    }));
}

export { listSeries, seriesIndex };
