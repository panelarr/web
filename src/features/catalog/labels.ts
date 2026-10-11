// SPDX-License-Identifier: GPL-3.0-or-later

/** Labels for the catalogue's open lists (types and statuses may grow; unknown values show as is). */
export const TYPE_LABELS: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  webtoon: "Webtoon",
  comic: "Comic",
  light_novel: "Light novel",
};

export const STATUS_LABELS: Record<string, string> = {
  releasing: "Releasing",
  completed: "Completed",
  hiatus: "On hiatus",
  cancelled: "Cancelled",
  upcoming: "Upcoming",
  unknown: "Unknown",
};

export const SORT_LABELS = {
  relevance: "Best match",
  popularity: "Popularity",
  rating: "Rating",
  updated: "Recently updated",
  year: "Year",
  title: "Title",
} as const;

export type CatalogSort = keyof typeof SORT_LABELS;

export const label = (labels: Record<string, string>, value: string | undefined) =>
  value ? (labels[value] ?? value.replaceAll("_", " ")) : undefined;
