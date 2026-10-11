// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Colour themes, as data. Each sets every colour token the UI uses (shadcn/ui's names,
 * plus success/warning/info). The accent colour is applied on top (see theme.ts).
 */
export type Scheme = "light" | "dark";

export const COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "success",
  "warning",
  "info",
  "border",
  "input",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

export interface ThemePreset {
  id: string;
  name: string;
  scheme: Scheme;
  colors: Record<ColorToken, string>;
}

const light: ThemePreset = {
  id: "light",
  name: "Light",
  scheme: "light",
  colors: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.145 0 0)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.145 0 0)",
    secondary: "oklch(0.97 0 0)",
    "secondary-foreground": "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    "muted-foreground": "oklch(0.5 0 0)",
    accent: "oklch(0.95 0 0)",
    "accent-foreground": "oklch(0.205 0 0)",
    destructive: "oklch(0.577 0.245 27.325)",
    success: "oklch(0.52 0.14 150)",
    warning: "oklch(0.6 0.15 70)",
    info: "oklch(0.55 0.15 250)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.88 0 0)",
    sidebar: "oklch(0.985 0 0)",
    "sidebar-foreground": "oklch(0.145 0 0)",
    "sidebar-accent": "oklch(0.95 0 0)",
    "sidebar-accent-foreground": "oklch(0.205 0 0)",
    "sidebar-border": "oklch(0.922 0 0)",
  },
};

const dark: ThemePreset = {
  id: "dark",
  name: "Dark",
  scheme: "dark",
  colors: {
    background: "oklch(0.16 0.005 285)",
    foreground: "oklch(0.985 0 0)",
    card: "oklch(0.205 0.005 285)",
    "card-foreground": "oklch(0.985 0 0)",
    popover: "oklch(0.205 0.005 285)",
    "popover-foreground": "oklch(0.985 0 0)",
    secondary: "oklch(0.27 0.005 285)",
    "secondary-foreground": "oklch(0.985 0 0)",
    muted: "oklch(0.27 0.005 285)",
    "muted-foreground": "oklch(0.72 0 0)",
    accent: "oklch(0.27 0.005 285)",
    "accent-foreground": "oklch(0.985 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    success: "oklch(0.72 0.15 150)",
    warning: "oklch(0.8 0.14 80)",
    info: "oklch(0.72 0.13 250)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    sidebar: "oklch(0.19 0.005 285)",
    "sidebar-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(0.27 0.005 285)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(1 0 0 / 10%)",
  },
};

/** True black for OLED screens: black surfaces, slightly lifted cards. */
const black: ThemePreset = {
  id: "black",
  name: "True black",
  scheme: "dark",
  colors: {
    ...dark.colors,
    background: "oklch(0 0 0)",
    card: "oklch(0.16 0 0)",
    popover: "oklch(0.16 0 0)",
    secondary: "oklch(0.22 0 0)",
    muted: "oklch(0.22 0 0)",
    accent: "oklch(0.22 0 0)",
    border: "oklch(1 0 0 / 12%)",
    sidebar: "oklch(0 0 0)",
    "sidebar-accent": "oklch(0.2 0 0)",
    "sidebar-border": "oklch(1 0 0 / 12%)",
  },
};

/** Warm paper, easy on the eyes for long reading. */
const sepia: ThemePreset = {
  id: "sepia",
  name: "Sepia",
  scheme: "light",
  colors: {
    ...light.colors,
    background: "oklch(0.96 0.02 85)",
    foreground: "oklch(0.28 0.03 60)",
    card: "oklch(0.98 0.015 85)",
    "card-foreground": "oklch(0.28 0.03 60)",
    popover: "oklch(0.98 0.015 85)",
    "popover-foreground": "oklch(0.28 0.03 60)",
    secondary: "oklch(0.92 0.025 85)",
    "secondary-foreground": "oklch(0.3 0.03 60)",
    muted: "oklch(0.92 0.025 85)",
    "muted-foreground": "oklch(0.48 0.03 60)",
    accent: "oklch(0.9 0.03 85)",
    "accent-foreground": "oklch(0.3 0.03 60)",
    border: "oklch(0.86 0.03 85)",
    input: "oklch(0.82 0.03 85)",
    sidebar: "oklch(0.94 0.025 85)",
    "sidebar-foreground": "oklch(0.28 0.03 60)",
    "sidebar-accent": "oklch(0.9 0.03 85)",
    "sidebar-accent-foreground": "oklch(0.3 0.03 60)",
    "sidebar-border": "oklch(0.86 0.03 85)",
  },
};

/** A cool, blue-grey dark theme. */
const frost: ThemePreset = {
  id: "frost",
  name: "Frost",
  scheme: "dark",
  colors: {
    ...dark.colors,
    background: "oklch(0.25 0.025 255)",
    foreground: "oklch(0.93 0.015 250)",
    card: "oklch(0.29 0.025 255)",
    "card-foreground": "oklch(0.93 0.015 250)",
    popover: "oklch(0.29 0.025 255)",
    "popover-foreground": "oklch(0.93 0.015 250)",
    secondary: "oklch(0.34 0.025 255)",
    muted: "oklch(0.34 0.025 255)",
    "muted-foreground": "oklch(0.75 0.02 250)",
    accent: "oklch(0.34 0.025 255)",
    border: "oklch(0.93 0.015 250 / 12%)",
    input: "oklch(0.93 0.015 250 / 18%)",
    sidebar: "oklch(0.22 0.025 255)",
    "sidebar-accent": "oklch(0.32 0.025 255)",
    "sidebar-border": "oklch(0.93 0.015 250 / 12%)",
  },
};

/** A deep green dark theme. */
const forest: ThemePreset = {
  id: "forest",
  name: "Forest",
  scheme: "dark",
  colors: {
    ...dark.colors,
    background: "oklch(0.2 0.025 160)",
    foreground: "oklch(0.94 0.015 150)",
    card: "oklch(0.24 0.028 160)",
    "card-foreground": "oklch(0.94 0.015 150)",
    popover: "oklch(0.24 0.028 160)",
    "popover-foreground": "oklch(0.94 0.015 150)",
    secondary: "oklch(0.29 0.03 160)",
    muted: "oklch(0.29 0.03 160)",
    "muted-foreground": "oklch(0.74 0.025 150)",
    accent: "oklch(0.29 0.03 160)",
    border: "oklch(0.94 0.015 150 / 11%)",
    input: "oklch(0.94 0.015 150 / 17%)",
    sidebar: "oklch(0.18 0.025 160)",
    "sidebar-accent": "oklch(0.27 0.03 160)",
    "sidebar-border": "oklch(0.94 0.015 150 / 11%)",
  },
};

export const THEME_PRESETS: readonly ThemePreset[] = [light, sepia, dark, black, frost, forest];

/** Accent colours to pick from (any colour works too). The first is Panelarr's pink. */
export const ACCENT_SWATCHES: ReadonlyArray<[hex: string, name: string]> = [
  ["#E0457B", "Panelarr pink"],
  ["#E5484D", "Red"],
  ["#F76B15", "Orange"],
  ["#D6A400", "Gold"],
  ["#30A46C", "Green"],
  ["#12A594", "Teal"],
  ["#3E63DD", "Blue"],
  ["#8E4EC6", "Violet"],
];

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id);
}
