// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { $api, api } from "@/api/client";
import type { StoredPreferences } from "@/theme/sync";

/**
 * One part of the user's stored preferences (on every device), read through `parse` (which
 * fills in defaults and drops anything unknown) and saved whole when it changes.
 */
export function usePreference<T>(
  key: string,
  parse: (raw: unknown) => T,
): { value: T; save: (next: T) => void; loaded: boolean } {
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
  return { value, save, loaded: stored.isSuccess || stored.isError };
}
