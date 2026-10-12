// SPDX-License-Identifier: GPL-3.0-or-later

import { usePreference } from "@/lib/preferences";
import { type ChapterView, DEFAULT_VIEW } from "./chapter-view";

/** The parts of the chapter list's view remembered per user (filters are per visit). */
export type RememberedView = Pick<ChapterView, "order" | "sort" | "display">;

function parse(raw: unknown): RememberedView {
  const saved = (raw ?? {}) as Partial<Record<string, unknown>>;
  return {
    order: saved.order === "asc" ? "asc" : DEFAULT_VIEW.order,
    sort: saved.sort === "date" ? "date" : DEFAULT_VIEW.sort,
    display: saved.display === "number" ? "number" : DEFAULT_VIEW.display,
  };
}

/**
 * How a work's chapters are listed by default: newest first, by number, with their titles,
 * unless the user chose otherwise, which is remembered in their preferences (on every device).
 */
export function useChapterPrefs(): { saved: RememberedView; remember: (view: RememberedView) => void } {
  const { value, save } = usePreference("chapters", parse);
  return {
    saved: value,
    remember: (view) => save({ order: view.order, sort: view.sort, display: view.display }),
  };
}
