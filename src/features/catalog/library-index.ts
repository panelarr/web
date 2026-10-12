// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema.gen";

export type LibraryEntry = components["schemas"]["LibraryEntry"];

/** Its first part is what the event stream invalidates when the library changes. */
export const LIBRARY_INDEX_KEY = ["library-index"] as const;

async function readLibrary(signal: AbortSignal): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = [];
  let token = "";
  do {
    const { data } = await api.GET("/library", { params: { query: { page_size: 200, page_token: token } }, signal });
    entries.push(...(data?.entries ?? []));
    token = data?.next_page_token ?? "";
  } while (token);
  return entries;
}

/** The user's whole library (every page), for the library grid. */
export function useLibrary() {
  return useQuery({ queryKey: LIBRARY_INDEX_KEY, staleTime: 60_000, queryFn: ({ signal }) => readLibrary(signal) });
}
