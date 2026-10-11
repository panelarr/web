// SPDX-License-Identifier: GPL-3.0-or-later

import { Store } from "@tanstack/react-store";
import { parseHex, readableOn } from "./color";
import { DEFAULT_ACCENT, DEFAULT_FONT, DEFAULT_THEME } from "./defaults";
import { findFont } from "./fonts";
import { COLOR_TOKENS, findPreset, type ThemePreset } from "./presets";

/** A user's appearance choices. `theme` is a preset ID or "system" (light or dark, following the device). */
export interface ThemePrefs {
  theme: string;
  accent: string;
  font: string;
}

export const DEFAULT_PREFS: ThemePrefs = { theme: DEFAULT_THEME, accent: DEFAULT_ACCENT, font: DEFAULT_FONT };

/** The CSS variables for one preset with the accent applied, plus whether it is dark. */
export interface ResolvedTheme {
  dark: boolean;
  vars: Record<string, string>;
}

/**
 * Saved in localStorage for public/theme-boot.js, which applies it before the first paint.
 * `light` and `dark` differ only when following the system.
 */
export interface BootCache {
  version: 1;
  system: boolean;
  light: ResolvedTheme;
  dark: ResolvedTheme;
}

export const STORAGE_KEY = "panelarr.theme";
const PREFS_KEY = "panelarr.theme.prefs";

export function resolve(preset: ThemePreset, prefs: ThemePrefs): ResolvedTheme {
  const accent = parseHex(prefs.accent) ? prefs.accent : DEFAULT_ACCENT;
  const onAccent = readableOn(accent);
  const vars: Record<string, string> = {};
  for (const token of COLOR_TOKENS) vars[`--${token}`] = preset.colors[token];
  for (const token of ["primary", "ring", "sidebar-primary", "sidebar-ring"]) vars[`--${token}`] = accent;
  vars["--primary-foreground"] = onAccent;
  vars["--sidebar-primary-foreground"] = onAccent;
  vars["--font-ui"] = findFont(prefs.font).family;
  return { dark: preset.scheme === "dark", vars };
}

export function bootCache(prefs: ThemePrefs): BootCache {
  const fixed = findPreset(prefs.theme);
  const light = resolve(fixed ?? (findPreset("light") as ThemePreset), prefs);
  const dark = fixed ? light : resolve(findPreset("dark") as ThemePreset, prefs);
  return { version: 1, system: !fixed, light, dark };
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies a resolved theme to the document: CSS variables, the dark class, the browser's theme colour. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  root.classList.toggle("dark", theme.dark);
  root.style.removeProperty("background"); // theme-boot.js's fallback
  root.style.colorScheme = theme.dark ? "dark" : "light";
  const background = theme.vars["--background"];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && background) meta.setAttribute("content", background);
}

function readPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ThemePrefs>) };
  } catch {
    // Storage blocked or corrupt: use the defaults.
  }
  return DEFAULT_PREFS;
}

function writeCache(prefs: ThemePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bootCache(prefs)));
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}

/** The current appearance choices. Later they are also saved on the server, per user. */
export const themeStore = new Store<ThemePrefs>(readPrefs());

export function setThemePrefs(change: Partial<ThemePrefs>): void {
  themeStore.setState((prev) => ({ ...prev, ...change }));
}

/** Applies the theme now, on every change, and when the system's light/dark setting flips. */
export function startTheming(): () => void {
  const apply = () => {
    const prefs = themeStore.state;
    const cache = bootCache(prefs);
    applyTheme(cache.system && systemPrefersDark() ? cache.dark : cache.light);
    void findFont(prefs.font).load?.();
    writeCache(prefs);
  };
  apply();
  const subscription = themeStore.subscribe(apply);
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
  media?.addEventListener("change", apply);
  return () => {
    subscription.unsubscribe();
    media?.removeEventListener("change", apply);
  };
}
