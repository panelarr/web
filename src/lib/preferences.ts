// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { $api, api } from "@/api/client";
import type { StoredPreferences } from "@/theme/sync";

/**
 * One part of the user's stored preferences (on every device), read through `parse` (which
 * fills in defaults and drops anything unknown) and saved whole when it changes.
 */
export function usePreference<T>(
  key: string,
  parse: (raw: unknown) => T,
): { value: T; save: (next: T) => void; loaded: boolean; failedAt: number | undefined; retry: () => void } {
  const queryClient = useQueryClient();
  // One cache entry for the preferences, read and written: they hold more than one feature's.
  const options = $api.queryOptions("get", "/me/preferences", {}, { staleTime: Number.POSITIVE_INFINITY });
  const stored = useQuery(options);
  const value = parse((stored.data as StoredPreferences | undefined)?.[key]);
  const save = (next: T) => {
    const current = (queryClient.getQueryData(options.queryKey) ?? {}) as StoredPreferences;
    if (JSON.stringify(current[key]) === JSON.stringify(next)) return;
    const updated: StoredPreferences = { ...current, version: 1, [key]: next };
    queryClient.setQueryData(options.queryKey, updated);
    void api.PUT("/me/preferences", { body: updated }).catch(() => {
      // Not saved: this page keeps the choice; the next change tries again.
    });
  };
  // `loaded` only once the server answered: until then (or after an error) `value` is the
  // defaults, not what the user chose. `failedAt` is when the last attempt failed, while failing.
  const { refetch } = stored;
  const retry = useCallback(() => void refetch(), [refetch]);
  return { value, save, loaded: stored.isSuccess, failedAt: stored.isError ? stored.errorUpdatedAt : undefined, retry };
}
