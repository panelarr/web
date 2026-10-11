// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";

export type Chapter = components["schemas"]["UnifiedChapter"];
export type Variant = components["schemas"]["ChapterVariant"];
export type Progress = components["schemas"]["ChapterProgress"];

/** Why the chosen copy won, in words. */
export const REASONS: Record<string, string> = {
  pinned: "chosen by hand",
  only_source: "only source",
  language: "preferred language",
  healthier_source: "the other source is failing",
  priority: "higher priority",
  newest_upload: "newest upload",
  first_listed: "first source",
};

export function reasonText(reason: string): string {
  return REASONS[reason] ?? reason.replaceAll("_", " ");
}

const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** "Vol. 2 · Chapter 12: The fall", without repeating a number the title already has. */
export function chapterLabel(chapter: Pick<Chapter, "number" | "volume" | "title">): string {
  const parts: string[] = [];
  if (chapter.volume) parts.push(`Vol. ${chapter.volume}`);
  const number = chapter.number !== undefined ? NUMBER.format(chapter.number) : undefined;
  const hasNumber = number !== undefined && new RegExp(`\\b${number.replace(".", "\\.")}\\b`).test(chapter.title);
  if (number !== undefined && !hasNumber) parts.push(`Chapter ${number}`);
  if (chapter.title) parts.push(chapter.title);
  return parts.join(" · ");
}

/** The chapters before `id` in reading order (ascending), e.g. to mark them read. */
export function chaptersBefore(chapters: Chapter[], id: string): string[] {
  const sorted = [...chapters].sort(readingOrder);
  const index = sorted.findIndex((c) => c.id === id);
  return index > 0 ? sorted.slice(0, index).map((c) => c.id) : [];
}

/** The chapters after `id` in reading order, e.g. to download the rest. */
export function chaptersAfter(chapters: Chapter[], id: string): string[] {
  const sorted = [...chapters].sort(readingOrder);
  const index = sorted.findIndex((c) => c.id === id);
  return index >= 0 ? sorted.slice(index + 1).map((c) => c.id) : [];
}

/** Numbered chapters by number, extras after. */
export function readingOrder(a: Chapter, b: Chapter): number {
  if (a.number === undefined && b.number === undefined) return 0;
  if (a.number === undefined) return 1;
  if (b.number === undefined) return -1;
  return a.number - b.number;
}
