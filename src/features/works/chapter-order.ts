// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { $api, api } from "@/api/client";
import type { StoredPreferences } from "@/theme/sync";
import { type ChapterView, DEFAULT_VIEW } from "./chapter-view";

/** The parts of the chapter list's view remembered per user (filters are per visit). */
export type RememberedView = Pick<ChapterView, "order" | "sort" | "display">;

/**
 * How a work's chapters are listed by default: newest first, by number, with their titles,
 * unless the user chose otherwise, which is remembered in their preferences (on every device).
 */
export function useChapterPrefs(): { saved: RememberedView; remember: (view: RememberedView) => void } {
  const queryClient = useQueryClient();
  // One cache entry for the preferences, read and written: they hold more than one feature's.
  const options = $api.queryOptions("get", "/me/preferences", {}, { staleTime: Number.POSITIVE_INFINITY });
  const stored = useQuery(options);
  const raw = (stored.data as StoredPreferences | undefined)?.chapters as Partial<Record<string, unknown>> | undefined;
  const saved: RememberedView = {
    order: raw?.order === "asc" ? "asc" : DEFAULT_VIEW.order,
    sort: raw?.sort === "date" ? "date" : DEFAULT_VIEW.sort,
    display: raw?.display === "number" ? "number" : DEFAULT_VIEW.display,
  };
  const remember = (view: RememberedView) => {
    const current = (queryClient.getQueryData(options.queryKey) ?? {}) as StoredPreferences;
    const before = current.chapters as Partial<RememberedView> | undefined;
    if (before?.order === view.order && before.sort === view.sort && before.display === view.display) return;
    const updated: StoredPreferences = {
      ...current,
      version: 1,
      chapters: { order: view.order, sort: view.sort, display: view.display },
    };
    queryClient.setQueryData(options.queryKey, updated);
    void api.PUT("/me/preferences", { body: updated }).catch(() => {
      // Not saved: this page keeps the view; the next change tries again.
    });
  };
  return { saved, remember };
}
