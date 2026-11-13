// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";
import type { LibraryEntry } from "@/features/catalog/library-index";

export type ViewDefinition = components["schemas"]["LibraryViewDefinition"];
export type SavedView = components["schemas"]["LibraryView"];

export const SORTS = {
  title: "Title",
  added: "Recently added",
  read: "Recently read",
  latest: "Latest chapter",
  updated: "Recently updated",
  unread: "Unread chapters",
  total: "Total chapters",
} as const satisfies Record<NonNullable<ViewDefinition["sort"]>, string>;
export type Sort = keyof typeof SORTS;

export const FILTERS = {
  unread: "Unread",
  started: "Started",
  downloaded: "Downloaded",
  bookmarked: "Bookmarked",
  new: "New chapters",
} as const satisfies Record<keyof NonNullable<ViewDefinition["filters"]>, string>;
export type Filter = keyof typeof FILTERS;

/** A filter keeps the works it matches (`include`) or drops them (`exclude`); unset, it does neither. */
export type FilterMode = "include" | "exclude";

export type Layout = "compact" | "comfortable" | "list";

/** A work's content rating, from its metadata (`unknown`: the metadata has none). */
export type Rating = components["schemas"]["EntryContentRating"];
/** The user's ceiling: the strongest rating they may see. */
export type Ceiling = components["schemas"]["ContentRating"];

/** The content ratings, mildest first, then works without one. */
export const RATINGS = {
  safe: "Safe",
  suggestive: "Suggestive",
  erotic: "Erotic",
  pornographic: "Pornographic",
  unknown: "Unrated",
} as const satisfies Record<Rating, string>;

/** 18+ is erotic and pornographic; suggestive isn't. */
export const ADULT: readonly Rating[] = ["erotic", "pornographic"];
/** "Hide 18+": every rating but those, unrated works included. */
export const NOT_ADULT: readonly Rating[] = ["safe", "suggestive", "unknown"];

/** Whether a user with this ceiling may see 18+ works at all. */
export const seesAdult = (ceiling: Ceiling) => ceiling === "erotic" || ceiling === "pornographic";

/** The "updated within" choices offered, in days. */
export const UPDATED_WITHIN = [1, 3, 7, 14, 30, 90] as const;

/**
 * How the library is shown: a saved view's definition with the app's defaults filled in, plus
 * the transient search.
 */
export interface LibraryView {
  q?: string | undefined;
  filters: Partial<Record<Filter, FilterMode>>;
  /** Only works of these types (empty: any). */
  types: readonly string[];
  /** Only works with these publication statuses (empty: any). */
  statuses: readonly string[];
  /** Only works with these content ratings (empty: any). */
  contentRatings: readonly Rating[];
  /** Only works with a new chapter found within this many days. */
  updatedWithinDays?: number | undefined;
  sort: Sort;
  /** Reversed from the sort's natural order (A–Z, newest first, most first). */
  reverse: boolean;
  layout: Layout;
  unreadBadges: boolean;
  downloadBadges: boolean;
  continueButton: boolean;
}

export const DEFAULT_VIEW: LibraryView = {
  filters: {},
  types: [],
  statuses: [],
  contentRatings: [],
  sort: "title",
  reverse: false,
  layout: "comfortable",
  unreadBadges: true,
  downloadBadges: false,
  continueButton: true,
};

const isSort = (value: unknown): value is Sort => typeof value === "string" && value in SORTS;
const isLayout = (value: unknown): value is Layout =>
  value === "compact" || value === "comfortable" || value === "list";
const isMode = (value: unknown): value is FilterMode => value === "include" || value === "exclude";
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
const isRating = (value: unknown): value is Rating => typeof value === "string" && Object.hasOwn(RATINGS, value);
/** The ratings a definition holds that the app knows, once each, in the fixed order. */
const ratings = (value: unknown): Rating[] => {
  const held = Array.isArray(value) ? value.filter(isRating) : [];
  return (Object.keys(RATINGS) as Rating[]).filter((r) => held.includes(r));
};

/** A saved definition as the app shows it: anything missing or unknown takes the default. */
export function fromDefinition(definition: ViewDefinition | undefined): LibraryView {
  const d = definition ?? {};
  const filters: LibraryView["filters"] = {};
  for (const filter of Object.keys(FILTERS) as Filter[]) {
    const mode = d.filters?.[filter];
    if (isMode(mode)) filters[filter] = mode;
  }
  const days = d.updated_within_days;
  return {
    filters,
    types: strings(d.types),
    statuses: strings(d.statuses),
    contentRatings: ratings(d.content_ratings),
    ...(typeof days === "number" && days >= 1 ? { updatedWithinDays: days } : {}),
    sort: isSort(d.sort) ? d.sort : DEFAULT_VIEW.sort,
    reverse: flag(d.reverse, DEFAULT_VIEW.reverse),
    layout: isLayout(d.display?.layout) ? d.display.layout : DEFAULT_VIEW.layout,
    unreadBadges: flag(d.display?.unread_badges, DEFAULT_VIEW.unreadBadges),
    downloadBadges: flag(d.display?.download_badges, DEFAULT_VIEW.downloadBadges),
    continueButton: flag(d.display?.continue_button, DEFAULT_VIEW.continueButton),
  };
}

/** The definition to save for a view (the search isn't part of it). */
export function toDefinition(view: LibraryView): ViewDefinition {
  const filters = Object.fromEntries(
    (Object.keys(FILTERS) as Filter[]).flatMap((f) => (view.filters[f] ? [[f, view.filters[f]]] : [])),
  );
  return {
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(view.types.length > 0 ? { types: [...view.types] } : {}),
    ...(view.statuses.length > 0 ? { statuses: [...view.statuses] } : {}),
    ...(view.contentRatings.length > 0 ? { content_ratings: [...view.contentRatings] } : {}),
    ...(view.updatedWithinDays ? { updated_within_days: view.updatedWithinDays } : {}),
    sort: view.sort,
    reverse: view.reverse,
    display: {
      layout: view.layout,
      unread_badges: view.unreadBadges,
      download_badges: view.downloadBadges,
      continue_button: view.continueButton,
    },
  };
}

/** How many of the view's filters narrow the library (filters, types, statuses, ratings, updated within). */
export function activeFilters(view: LibraryView): number {
  return (
    Object.keys(view.filters).length +
    (view.types.length > 0 ? 1 : 0) +
    (view.statuses.length > 0 ? 1 : 0) +
    (view.contentRatings.length > 0 ? 1 : 0) +
    (view.updatedWithinDays ? 1 : 0)
  );
}

/** The view with nothing filtered out (its sort and display kept). */
export function withoutFilters(view: LibraryView): LibraryView {
  const { updatedWithinDays: _, ...rest } = view;
  return { ...rest, filters: {}, types: [], statuses: [], contentRatings: [] };
}

const MATCHES: Record<Filter, (entry: LibraryEntry) => boolean> = {
  unread: (e) => e.unread > 0,
  started: (e) => e.started,
  downloaded: (e) => e.downloaded > 0,
  bookmarked: (e) => e.bookmarks > 0,
  new: (e) => e.new_chapters > 0,
};

/** An entry's rating is its work's (the metadata's); none counts as unrated. */
const ratingOf = (entry: LibraryEntry): Rating => entry.work.content_rating ?? "unknown";

const DAY_MS = 86_400_000;

const byTitle = (a: LibraryEntry, b: LibraryEntry) => a.work.title.localeCompare(b.work.title);
/** Newest first; works without a date last. */
const byDate = (pick: (e: LibraryEntry) => string | undefined) => (a: LibraryEntry, b: LibraryEntry) =>
  (pick(b) ?? "").localeCompare(pick(a) ?? "") || byTitle(a, b);
const byLatest = byDate((e) => e.latest_chapter_at);

/** When a new chapter was last found, newest first; works that never had one after, by their latest chapter. */
function byUpdated(a: LibraryEntry, b: LibraryEntry): number {
  if (a.last_updated_at && b.last_updated_at) {
    return b.last_updated_at.localeCompare(a.last_updated_at) || byTitle(a, b);
  }
  if (a.last_updated_at) return -1;
  if (b.last_updated_at) return 1;
  return byLatest(a, b);
}

const SORTERS: Record<Sort, (a: LibraryEntry, b: LibraryEntry) => number> = {
  title: byTitle,
  added: byDate((e) => e.added_at),
  read: byDate((e) => e.last_read_at),
  latest: byLatest,
  updated: byUpdated,
  unread: (a, b) => b.unread - a.unread || byTitle(a, b),
  total: (a, b) => b.chapters - a.chapters || byTitle(a, b),
};

/** Whether an entry passes the view's filters (not the search). */
export function matchesView(entry: LibraryEntry, view: LibraryView, now: number = Date.now()): boolean {
  for (const filter of Object.keys(view.filters) as Filter[]) {
    const mode = view.filters[filter];
    if (mode && MATCHES[filter](entry) !== (mode === "include")) return false;
  }
  if (view.types.length > 0 && !view.types.includes(entry.work.type ?? "")) return false;
  if (view.statuses.length > 0 && !view.statuses.includes(entry.work.status ?? "")) return false;
  if (view.contentRatings.length > 0 && !view.contentRatings.includes(ratingOf(entry))) return false;
  if (view.updatedWithinDays) {
    const at = entry.last_updated_at ? Date.parse(entry.last_updated_at) : Number.NaN;
    if (!(at >= now - view.updatedWithinDays * DAY_MS)) return false;
  }
  return true;
}

/** The entries to show: searched, filtered, then sorted. */
export function viewLibrary(
  entries: readonly LibraryEntry[],
  view: LibraryView,
  now: number = Date.now(),
): LibraryEntry[] {
  const q = view.q?.trim().toLowerCase();
  const shown = entries.filter(
    (entry) => (!q || entry.work.title.toLowerCase().includes(q)) && matchesView(entry, view, now),
  );
  shown.sort(SORTERS[view.sort]);
  return view.reverse ? shown.reverse() : shown;
}

/** How many entries each filter matches (for the sheet). */
export function filterCounts(entries: readonly LibraryEntry[]): Record<Filter, number> {
  return Object.fromEntries(
    (Object.keys(FILTERS) as Filter[]).map((filter) => [filter, entries.filter(MATCHES[filter]).length]),
  ) as Record<Filter, number>;
}

/**
 * The work types or statuses in the library, with how many works have each, most first: the
 * sheet offers only these (they're open lists). Values a view keeps that aren't in the library
 * any more are listed too (with 0), so they can be taken off.
 */
export function valuesIn(
  entries: readonly LibraryEntry[],
  field: "type" | "status",
  chosen: readonly string[] = [],
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>(chosen.map((value) => [value, 0]));
  for (const entry of entries) {
    const value = entry.work[field];
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * The content ratings the sheet offers, mildest first, with how many works have each: those up
 * to the user's ceiling, then unrated. One a view still holds above the ceiling (it was lowered
 * since) is listed too, so it can be taken off.
 */
export function ratingCounts(
  entries: readonly LibraryEntry[],
  ceiling: Ceiling,
  chosen: readonly Rating[] = [],
): Array<{ value: Rating; count: number }> {
  const order = Object.keys(RATINGS) as Rating[];
  const limit = order.indexOf(ceiling);
  return order
    .filter((rating, i) => rating === "unknown" || i <= limit || chosen.includes(rating))
    .map((value) => ({ value, count: entries.filter((entry) => ratingOf(entry) === value).length }));
}
