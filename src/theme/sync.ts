// SPDX-License-Identifier: GPL-3.0-or-later

import { useAsyncDebouncedCallback } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { $api, api } from "@/api/client";
import { findPreset } from "./presets";
import { type ThemePrefs, themeStore } from "./theme";

/** The app's part of the server's per-user preferences (the shape is the app's own). */
export interface StoredPreferences {
  version?: number;
  theme?: Partial<ThemePrefs>;
  [key: string]: unknown;
}

/** Keeps only valid appearance choices from what the server stored. */
export function themeFromStored(stored: StoredPreferences | undefined): Partial<ThemePrefs> {
  const theme = stored?.theme;
  if (!theme || typeof theme !== "object") return {};
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  const out: Partial<ThemePrefs> = {};
  if (typeof theme.theme === "string" && (theme.theme === "system" || findPreset(theme.theme))) out.theme = theme.theme;
  if (hex(theme.accent)) out.accent = hex(theme.accent);
  if (typeof theme.font === "string") out.font = theme.font;
  out.background = hex(theme.background);
  out.surface = hex(theme.surface);
  return out;
}

/**
 * Appearance follows the user across devices: on sign-in the account's choices win; changes
 * made here are saved to the account (shortly after the last one).
 */
export function usePreferencesSync(): void {
  const queryClient = useQueryClient();
  const options = $api.queryOptions("get", "/me/preferences");
  const stored = $api.useQuery("get", "/me/preferences", {}, { staleTime: Number.POSITIVE_INFINITY });
  const applying = useRef(false);
  const loaded = useRef(false);

  // The account's choices replace this device's when they arrive.
  useEffect(() => {
    if (!stored.data || loaded.current) return;
    loaded.current = true;
    const theme = themeFromStored(stored.data as StoredPreferences);
    if (Object.keys(theme).length === 0) return;
    applying.current = true;
    themeStore.setState((prev) => ({ ...prev, ...theme }));
    applying.current = false;
  }, [stored.data]);

  const save = useAsyncDebouncedCallback(
    async (theme: ThemePrefs) => {
      const current = (queryClient.getQueryData(options.queryKey) ?? {}) as StoredPreferences;
      const next: StoredPreferences = { ...current, version: 1, theme };
      queryClient.setQueryData(options.queryKey, next);
      await api.PUT("/me/preferences", { body: next }).catch(() => {
        // Not saved: this device keeps the choice; the next change tries again.
      });
    },
    { wait: 600 },
  );

  useEffect(() => {
    const subscription = themeStore.subscribe((prefs) => {
      if (applying.current || !loaded.current) return;
      void save(prefs);
    });
    return () => subscription.unsubscribe();
  }, [save]);
}
