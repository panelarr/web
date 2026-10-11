// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * UI fonts, as data. Every font is bundled with the app (never loaded from another host),
 * and only the chosen one is fetched. CJK text falls back to the system's fonts.
 */
export interface UiFont {
  id: string;
  name: string;
  family: string;
  /** Loads the font's CSS (and through it the font files). Absent for system fonts. */
  load?: () => Promise<unknown>;
}

const fallback = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";

export const UI_FONTS: readonly UiFont[] = [
  {
    id: "inter",
    name: "Inter",
    family: `'Inter Variable', ${fallback}`,
    load: () => import("@fontsource-variable/inter"),
  },
  { id: "system", name: "System", family: fallback },
];

export const DEFAULT_FONT = "inter";

export function findFont(id: string): UiFont {
  return UI_FONTS.find((font) => font.id === id) ?? (UI_FONTS[0] as UiFont);
}
