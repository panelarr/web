// SPDX-License-Identifier: GPL-3.0-or-later

// Unified chapters for the mock server: the attached series' chapters grouped by number,
// with a chosen copy and the reason, as the server does it.
import type { components } from "@/api/schema.gen";
import { seriesIndex, sourceChapters } from "./sources";
import { stableUuid } from "./works";

type S = components["schemas"];

export interface ChaptersState {
  matching: Record<string, S["WorkSourceState"][]>;
  /** Pinned copies: work → chapter → variant. */
  pins: Record<string, Record<string, string>>;
  /** Reading progress: user → chapter → progress. */
  progress: Record<string, Record<string, S["ChapterProgress"]>>;
  /** Chapters found since each user last marked a work seen: user → work → chapter IDs. */
  fresh: Record<string, Record<string, string[]>>;
  /** Per user, per work: bookmarked chapters, oldest bookmark first. */
  bookmarks: Record<string, Record<string, string[]>>;
  /** Downloaded chapters (shared). */
  downloaded: string[];
}

export function chapterId(workId: string, number: number | undefined, key: string): string {
  return stableUuid(`${workId}|${number ?? key}`);
}

function variant(row: S["WorkSourceState"], chapter: S["SourceChapter"], workId: string): S["ChapterVariant"] {
  const series = row.attached as S["MatchSeries"];
  return {
    id: stableUuid(`${workId}|${series.id}|${chapter.key}`),
    series_id: series.id,
    source_id: row.source.id,
    source_name: row.source.name,
    key: chapter.key,
    name: chapter.name,
    ...(chapter.number !== undefined ? { number: chapter.number } : {}),
    ...(chapter.volume ? { volume: chapter.volume } : {}),
    ...(chapter.scanlator ? { scanlator: chapter.scanlator } : {}),
    ...(chapter.lang ? { lang: chapter.lang } : {}),
    ...(chapter.uploaded_at ? { uploaded_at: chapter.uploaded_at } : {}),
    priority: series.priority,
    source_health: row.source.health.status,
  };
}

/** Every unified chapter of a work with all its copies, in reading order. */
export function unifiedChapters(
  state: ChaptersState,
  workId: string,
  userId: string,
): Array<{ chapter: S["UnifiedChapter"]; variants: S["ChapterVariant"][] }> {
  const rows = (state.matching[workId] ?? []).filter((row) => row.attached);
  const numbered = new Map<number, S["ChapterVariant"][]>();
  const extras: S["ChapterVariant"][] = [];
  for (const row of rows) {
    const series = row.attached as S["MatchSeries"];
    for (const chapter of sourceChapters(row.source.id, seriesIndex(series.key))) {
      const v = variant(row, chapter, workId);
      if (chapter.number === undefined) extras.push(v);
      else numbered.set(chapter.number, [...(numbered.get(chapter.number) ?? []), v]);
    }
  }
  const fresh = new Set(state.fresh[userId]?.[workId] ?? []);
  const bookmarked = new Set(state.bookmarks[userId]?.[workId] ?? []);
  const build = (id: string, variants: S["ChapterVariant"][], number?: number) => {
    const pinnedId = state.pins[workId]?.[id];
    const pinned = variants.find((v) => v.id === pinnedId);
    const healthy = variants.filter((v) => v.source_health !== "failing");
    const pool = healthy.length > 0 ? healthy : variants;
    const byPriority = [...pool].sort((a, b) => b.priority - a.priority);
    const chosen = pinned ?? byPriority[0];
    const reason = pinned
      ? "pinned"
      : variants.length === 1
        ? "only_source"
        : healthy.length < variants.length
          ? "healthier_source"
          : (byPriority[0]?.priority ?? 0) !== (byPriority[1]?.priority ?? 0)
            ? "priority"
            : "first_listed";
    const first = chosen ?? (variants[0] as S["ChapterVariant"]);
    const chapter: S["UnifiedChapter"] = {
      id,
      ...(number !== undefined ? { number } : {}),
      ...(first.volume ? { volume: first.volume } : {}),
      title: first.name,
      extra: number === undefined,
      available: true,
      new: fresh.has(id),
      bookmarked: bookmarked.has(id),
      variants: variants.length,
      reason,
      pinned: pinned !== undefined,
      downloaded: state.downloaded.includes(id),
      ...(chosen ? { chosen } : {}),
      created_at: first.uploaded_at ?? "2026-01-01T00:00:00Z",
    };
    return { chapter, variants };
  };
  return [
    ...[...numbered.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, variants]) => build(chapterId(workId, number, ""), variants, number)),
    ...extras.map((v) => build(chapterId(workId, undefined, `${v.source_id}|${v.key}`), [v])),
  ];
}

/** One source's chapters of the work, as the source lists them. */
export function seriesChapters(
  state: ChaptersState,
  workId: string,
  seriesId: string,
): S["SeriesChapterList"] | undefined {
  const row = (state.matching[workId] ?? []).find((r) => r.attached?.id === seriesId);
  if (!row?.attached) return undefined;
  return {
    series: row.attached,
    checked_at: row.checked_at ?? new Date().toISOString(),
    ...(row.source.health.status === "failing"
      ? { check_error: row.source.health.message ?? "The source failed." }
      : {}),
    chapters: sourceChapters(row.source.id, seriesIndex(row.attached.key)).map((chapter) => ({
      key: chapter.key,
      name: chapter.name,
      ...(chapter.number !== undefined ? { number: chapter.number } : {}),
      ...(chapter.volume ? { volume: chapter.volume } : {}),
      ...(chapter.scanlator ? { scanlator: chapter.scanlator } : {}),
      ...(chapter.lang ? { lang: chapter.lang } : {}),
      ...(chapter.uploaded_at ? { uploaded_at: chapter.uploaded_at } : {}),
      present: true,
      chapter_id: chapterId(workId, chapter.number, `${row.source.id}|${chapter.key}`),
    })),
  };
}

/** Where to continue: the first unread chapter after the last one read or started. */
export function continueChapter(
  chapters: S["UnifiedChapter"][],
  progress: Record<string, S["ChapterProgress"]>,
): string | undefined {
  let last = -1;
  chapters.forEach((chapter, i) => {
    if (progress[chapter.id]) last = i;
  });
  if (last >= 0) {
    const current = chapters[last];
    if (current && !progress[current.id]?.completed) return current.id;
    return chapters[last + 1]?.id ?? current?.id;
  }
  return chapters[0]?.id;
}
