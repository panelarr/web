// SPDX-License-Identifier: GPL-3.0-or-later

import { QueryClient } from "@tanstack/react-query";
import { ApiError, NETWORK_ERROR } from "./errors";

/** Retries only what may succeed on its own: network failures and 5xx, at most twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === NETWORK_ERROR || error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
