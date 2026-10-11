// SPDX-License-Identifier: GPL-3.0-or-later

import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createQueryClient } from "@/api/query-client";
import { createAppRouter } from "@/router";

/** Renders the whole app at `path`, against the mock server. */
export async function renderApp(path = "/") {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await router.load();
  return { ...result, router, queryClient };
}
