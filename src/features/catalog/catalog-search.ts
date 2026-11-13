// SPDX-License-Identifier: GPL-3.0-or-later

import { $api } from "@/api/client";
import type { paths } from "@/api/schema.gen";

export type CatalogSearchParams = NonNullable<paths["/catalog/search"]["get"]["parameters"]["query"]>;

/**
 * The catalogue's search, a page at a time: what Browse uses to add a work, and what choosing
 * the work of an imported series uses too, so both find the same entries.
 */
export function useCatalogSearch(params: CatalogSearchParams, options: { enabled?: boolean } = {}) {
  return $api.useInfiniteQuery(
    "get",
    "/catalog/search",
    { params: { query: params } },
    {
      initialPageParam: "",
      getNextPageParam: (last: { next_page_token: string }) => last.next_page_token || undefined,
      pageParamName: "page_token",
      enabled: options.enabled ?? true,
    },
  );
}
