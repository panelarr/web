// SPDX-License-Identifier: GPL-3.0-or-later

import { type Chapter, chapterLabel } from "./chapters";

/** How a work's chapter list is shown: kept in the URL, sort and display remembered per user. */
export interface ChapterView {
  /** Newest first (desc) or oldest first (asc). */
  order: "asc" | "desc";
  /** By chapter number (reading order) or by upload date. */
  sort: "number" | "date";
  /** Each chapter's own title, or just its number. */
  display: "title" | "number";
  unread: boolean;
  downloaded: boolean;
  bookmarked: boolean;
  scanlator?: string | undefined;
}

export const DEFAULT_VIEW: ChapterView = {
  order: "desc",
  sort: "number",
  display: "title",
  unread: false,
  downloaded: false,
  bookmarked: false,
};

/** How many filters are on (for the button's badge). */
export function filtersOn(view: ChapterView): number {
  return [view.unread, view.downloaded, view.bookmarked, view.scanlator !== undefined].filter(Boolean).length;
}

/**
 * The chapters to show, from the list in reading order (as the server sends it, oldest first):
 * filtered, then sorted by number (reading order) or upload date, newest or oldest first.
 */
export function viewChapters(
  chapters: readonly Chapter[],
  isRead: (id: string) => boolean,
  view: ChapterView,
): Chapter[] {
  const shown = chapters.filter(
    (c) =>
      (!view.unread || !isRead(c.id)) &&
      (!view.downloaded || c.downloaded) &&
      (!view.bookmarked || c.bookmarked) &&
      (view.scanlator === undefined || c.chosen?.scanlator === view.scanlator),
  );
  if (view.sort === "date") {
    const time = (c: Chapter) => (c.chosen?.uploaded_at ? Date.parse(c.chosen.uploaded_at) : Number.NEGATIVE_INFINITY);
    // Stable: chapters uploaded together keep their reading order.
    shown.sort((a, b) => time(a) - time(b));
  }
  return view.order === "desc" ? shown.reverse() : shown;
}

/** The scanlators the chapters' chosen copies come from, for the filter. */
export function scanlators(chapters: readonly Chapter[]): string[] {
  return [...new Set(chapters.flatMap((c) => (c.chosen?.scanlator ? [c.chosen.scanlator] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** A chapter's name as the list shows it. */
export function chapterName(chapter: Chapter, display: ChapterView["display"]): string {
  if (display === "number" && chapter.number !== undefined) {
    return chapterLabel({ number: chapter.number, ...(chapter.volume ? { volume: chapter.volume } : {}), title: "" });
  }
  return chapterLabel(chapter);
}

/**
 * The next `count` chapters to download: unread ones not stored yet, in reading order from
 * the first unread one.
 */
export function nextToDownload(chapters: readonly Chapter[], isRead: (id: string) => boolean, count: number): string[] {
  return chapters
    .filter((c) => !isRead(c.id) && !c.downloaded && c.available)
    .slice(0, count)
    .map((c) => c.id);
}
