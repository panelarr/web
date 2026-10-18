// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";
import { chapterLabel } from "@/features/works/chapters";
import { formatDate } from "@/lib/format";

export type HistoryItem = components["schemas"]["HistoryItem"];

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** The local day an entry falls on, as YYYY-MM-DD (for grouping). */
export function dayKey(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", else the date. */
export function dayLabel(value: string | Date, now: Date = new Date()): string {
  const key = dayKey(value);
  if (key === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";
  return formatDate(value);
}

/** Entries in order, in runs by day: [label, entries][]. */
export function byDay(items: readonly HistoryItem[], now: Date = new Date()): Array<[string, HistoryItem[]]> {
  const groups: Array<[string, HistoryItem[]]> = [];
  let last = "";
  for (const item of items) {
    const key = dayKey(item.updated_at);
    if (key !== last) {
      groups.push([dayLabel(item.updated_at, now), []]);
      last = key;
    }
    groups.at(-1)?.[1].push(item);
  }
  return groups;
}

/** The chapter, as everywhere else: "Vol. 3 · Chapter 200". */
export function chapterText(item: HistoryItem): string {
  return chapterLabel({
    number: item.chapter_number,
    volume: item.chapter_volume,
    title: item.chapter_title,
    display_title: item.chapter_display_title,
  });
}

/** Where reading stopped, short ("Page 13/117"), until the chapter is read. */
export function pageText(item: HistoryItem): string | undefined {
  return item.completed || !item.pages ? undefined : `Page ${item.page + 1}/${item.pages}`;
}

/** A line's details, the useful ones first so a long chapter name truncates harmlessly. */
export function detailText(item: HistoryItem): string {
  return [timeText(item.updated_at), pageText(item), chapterText(item)].filter(Boolean).join(" · ");
}

export const timeText = (value: string) => time.format(new Date(value));
