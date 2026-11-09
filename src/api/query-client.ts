// SPDX-License-Identifier: GPL-3.0-or-later

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, NETWORK_ERROR } from "./errors";

/**
 * Server errors that won't fix themselves in the next few seconds: retrying only keeps people
 * waiting for the same answer (a source that failed, a key the metadata service rejected).
 * They're shown at once, with Retry.
 */
const FINAL = new Set(["source_failed", "meta_key_rejected"]);

/** Retries only what may succeed on its own: network failures and 5xx, at most twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;
  if (FINAL.has(error.code)) return false;
  return error.status === NETWORK_ERROR || error.status >= 500;
}

/**
 * For extras from the metadata service that a page shows only when they're there (a series'
 * description): `meta_unavailable` usually means no metadata service is connected, which asking
 * again won't change, so those queries fail at once and the page goes on without them.
 */
export function shouldRetryOptionalMeta(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.code === "meta_unavailable") return false;
  return shouldRetry(failureCount, error);
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
