// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { $api, api } from "@/api/client";
import type { StoredPreferences } from "@/theme/sync";

export type ChapterOrder = "asc" | "desc";

/**
 * The order a work's chapters are listed in by default: newest first, unless the user chose
 * otherwise, which is remembered in their preferences (so on every device).
 */
export function useChapterOrder(): { order: ChapterOrder; remember: (order: ChapterOrder) => void } {
  const queryClient = useQueryClient();
  // One cache entry for the preferences, read and written: they hold more than one feature's.
  const options = $api.queryOptions("get", "/me/preferences", {}, { staleTime: Number.POSITIVE_INFINITY });
  const stored = useQuery(options);
  const saved = (stored.data as StoredPreferences | undefined)?.chapters as { order?: unknown } | undefined;
  const order: ChapterOrder = saved?.order === "asc" ? "asc" : "desc";
  const remember = (next: ChapterOrder) => {
    const current = (queryClient.getQueryData(options.queryKey) ?? {}) as StoredPreferences;
    if ((current.chapters as { order?: unknown } | undefined)?.order === next) return;
    const updated: StoredPreferences = { ...current, version: 1, chapters: { order: next } };
    queryClient.setQueryData(options.queryKey, updated);
    void api.PUT("/me/preferences", { body: updated }).catch(() => {
      // Not saved: this page keeps the order; the next change tries again.
    });
  };
  return { order, remember };
}
