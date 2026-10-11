// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { Loading } from "@/components/states";
import { routeTree } from "./routeTree.gen";

/** The path the app is served under, from <base href> ("/" unless the server sets a URL base). */
export function basePath(): string {
  return new URL(document.baseURI).pathname.replace(/\/$/, "") || "/";
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    basepath: basePath(),
    defaultPreload: "intent",
    // Loaders prefetch into TanStack Query, which owns caching.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <Loading />,
    scrollRestoration: true,
    ...(history ? { history } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
