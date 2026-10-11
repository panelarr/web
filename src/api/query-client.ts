// SPDX-License-Identifier: GPL-3.0-or-later

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, NETWORK_ERROR } from "./errors";

/** Retries only what may succeed on its own: network failures and 5xx, at most twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === NETWORK_ERROR || error.status >= 500;
}

export interface QueryClientOptions {
  /**
   * Called for every failed query and mutation, e.g. to send a signed-out user to sign in.
   * `queryKey` is set for queries.
   */
  onError?: (error: unknown, queryKey?: readonly unknown[]) => void;
}

export function createQueryClient({ onError }: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError?.(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => onError?.(error) }),
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
