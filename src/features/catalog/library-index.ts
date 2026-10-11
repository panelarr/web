// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema.gen";

type LibraryEntry = components["schemas"]["LibraryEntry"];

export const LIBRARY_INDEX_KEY = ["library-index"] as const;

/**
 * Which catalogue entries are in the user's library (entry ID → library entry), to mark them
 * while browsing. Reads every page of the library.
 */
export function useLibraryIndex() {
  return useQuery({
    queryKey: LIBRARY_INDEX_KEY,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const index = new Map<string, LibraryEntry>();
      let token = "";
      do {
        const { data } = await api.GET("/library", {
          params: { query: { page_size: 200, page_token: token } },
          signal,
        });
        for (const entry of data?.entries ?? []) index.set(entry.work.entry_id, entry);
        token = data?.next_page_token ?? "";
      } while (token);
      return index;
    },
  });
}
