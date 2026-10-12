// SPDX-License-Identifier: GPL-3.0-or-later

import type { LibraryEntry } from "@/features/catalog/library-index";

export const SORTS = {
  title: "Title",
  added: "Recently added",
  read: "Recently read",
  latest: "Latest chapter",
  unread: "Unread chapters",
  total: "Total chapters",
} as const;
export type Sort = keyof typeof SORTS;

export const FILTERS = {
  unread: "Unread",
  started: "Started",
  downloaded: "Downloaded",
  bookmarked: "Bookmarked",
} as const;
export type Filter = keyof typeof FILTERS;

export type Layout = "compact" | "comfortable" | "list";

/** How the library is shown: filters in the URL; sort and display remembered per user. */
export interface LibraryView {
  q?: string | undefined;
  filters: readonly Filter[];
  sort: Sort;
  /** Reversed from the sort's natural order (A–Z, newest first, most first). */
  reverse: boolean;
  layout: Layout;
  unreadBadges: boolean;
  downloadBadges: boolean;
  continueButton: boolean;
}

export const DEFAULT_VIEW: LibraryView = {
  filters: [],
  sort: "title",
  reverse: false,
  layout: "comfortable",
  unreadBadges: true,
  downloadBadges: false,
  continueButton: true,
};

const MATCHES: Record<Filter, (entry: LibraryEntry) => boolean> = {
  unread: (e) => e.unread > 0,
  started: (e) => e.started,
  downloaded: (e) => e.downloaded > 0,
  bookmarked: (e) => e.bookmarks > 0,
};

const byTitle = (a: LibraryEntry, b: LibraryEntry) => a.work.title.localeCompare(b.work.title);
/** Newest first; works without a date last. */
const byDate = (pick: (e: LibraryEntry) => string | undefined) => (a: LibraryEntry, b: LibraryEntry) =>
  (pick(b) ?? "").localeCompare(pick(a) ?? "") || byTitle(a, b);

const SORTERS: Record<Sort, (a: LibraryEntry, b: LibraryEntry) => number> = {
  title: byTitle,
  added: byDate((e) => e.added_at),
  read: byDate((e) => e.last_read_at),
  latest: byDate((e) => e.latest_chapter_at),
  unread: (a, b) => b.unread - a.unread || byTitle(a, b),
  total: (a, b) => b.chapters - a.chapters || byTitle(a, b),
};

/** The entries to show: searched, every filter on matching, then sorted. */
export function viewLibrary(entries: readonly LibraryEntry[], view: LibraryView): LibraryEntry[] {
  const q = view.q?.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (!q || entry.work.title.toLowerCase().includes(q)) && view.filters.every((filter) => MATCHES[filter](entry)),
  );
  shown.sort(SORTERS[view.sort]);
  return view.reverse ? shown.reverse() : shown;
}

/** How many entries each filter would keep (for the sheet). */
export function filterCounts(entries: readonly LibraryEntry[]): Record<Filter, number> {
  return Object.fromEntries(
    (Object.keys(FILTERS) as Filter[]).map((filter) => [filter, entries.filter(MATCHES[filter]).length]),
  ) as Record<Filter, number>;
}
