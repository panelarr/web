// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";
import { dayKey, dayLabel } from "@/features/history/history";
import { chapterLabel } from "@/features/works/chapters";

export type UpdateItem = components["schemas"]["UpdateItem"];

/** A series' new chapters on one day, newest first. */
export interface UpdateRow {
  workId: string;
  title: string;
  cover: string | undefined;
  chapters: UpdateItem[];
}

/** By day (Today, Yesterday, dates), then one row per series that day, in the feed's order. */
export function groupUpdates(items: readonly UpdateItem[], now: Date = new Date()): Array<[string, UpdateRow[]]> {
  const days: Array<[string, UpdateRow[]]> = [];
  let last = "";
  for (const item of items) {
    const key = dayKey(item.appeared_at);
    if (key !== last) {
      days.push([dayLabel(item.appeared_at, now), []]);
      last = key;
    }
    const rows = days.at(-1)?.[1] ?? [];
    const row = rows.find((r) => r.workId === item.work_id);
    if (row) row.chapters.push(item);
    else rows.push({ workId: item.work_id, title: item.work_title, cover: item.work_cover_url, chapters: [item] });
  }
  return days;
}

export function updateLabel(item: UpdateItem): string {
  return chapterLabel({
    number: item.chapter_number,
    volume: item.chapter_volume,
    title: item.chapter_title,
    display_title: item.chapter_display_title,
  });
}
