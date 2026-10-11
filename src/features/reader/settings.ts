// SPDX-License-Identifier: GPL-3.0-or-later

// Reader settings, kept by the server per user at three levels: global, per source and per
// work (series), a more specific level winning. Their shape belongs to this app; the server
// stores them as JSON. Anything missing falls back to defaults chosen by the work's type.

export const MODES = ["single", "double", "vertical", "webtoon", "horizontal"] as const;
export const DIRECTIONS = ["rtl", "ltr"] as const;
export const FITS = ["width", "height", "screen", "original"] as const;
export const TAP_ZONES = ["edge", "kindle", "lshape", "sides", "off"] as const;
export const TRANSITIONS = ["slide", "fade", "none"] as const;
export const BACKGROUNDS = ["theme", "auto", "black", "gray", "white"] as const;

export type Mode = (typeof MODES)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type Fit = (typeof FITS)[number];
export type TapZones = (typeof TAP_ZONES)[number];
export type Transition = (typeof TRANSITIONS)[number];
export type Background = (typeof BACKGROUNDS)[number];

export interface ReaderSettings {
  mode: Mode;
  direction: Direction;
  fit: Fit;
  /** Scale small pages up to the fit. */
  stretch: boolean;
  /** Pixels between pages in the vertical mode (webtoon has none). */
  pageGap: number;
  /** Widest a page gets on large screens, in pixels; 0 for no limit. */
  maxWidth: number;
  tapZones: TapZones;
  invertTapZones: boolean;
  transition: Transition;
  background: Background;
  /** Pages to load ahead. */
  preload: number;
  /** Show the first page alone in double-page mode (covers). */
  offsetSpreads: boolean;
  showPageNumber: boolean;
  /** Keep the screen on while reading. */
  keepAwake: boolean;
}

export type Level = "work" | "source" | "global" | "default";
export type PartialSettings = { [K in keyof ReaderSettings]?: ReaderSettings[K] };

const BASE: ReaderSettings = {
  mode: "single",
  direction: "rtl",
  fit: "screen",
  stretch: false,
  pageGap: 8,
  maxWidth: 900,
  tapZones: "edge",
  invertTapZones: false,
  transition: "slide",
  background: "theme",
  preload: 4,
  offsetSpreads: true,
  showPageNumber: true,
  keepAwake: true,
};

/** The defaults for a work's type: manga reads right to left, webtoons scroll. */
export function defaultsFor(type: string | undefined): ReaderSettings {
  switch (type) {
    case "manhwa":
    case "manhua":
    case "webtoon":
      return { ...BASE, mode: "webtoon", direction: "ltr", fit: "width" };
    case "comic":
      return { ...BASE, direction: "ltr" };
    default:
      return BASE;
  }
}

const ENUMS: Partial<Record<keyof ReaderSettings, readonly string[]>> = {
  mode: MODES,
  direction: DIRECTIONS,
  fit: FITS,
  tapZones: TAP_ZONES,
  transition: TRANSITIONS,
  background: BACKGROUNDS,
};

const RANGES: Partial<Record<keyof ReaderSettings, [number, number]>> = {
  pageGap: [0, 64],
  maxWidth: [0, 4000],
  preload: [0, 20],
};

/** Keeps only valid settings from what the server stored (it may be from an older or newer app). */
export function sanitize(stored: Record<string, unknown> | undefined): PartialSettings {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored ?? {})) {
    const k = key as keyof ReaderSettings;
    if (!(k in BASE)) continue;
    const allowed = ENUMS[k];
    const range = RANGES[k];
    if (allowed) {
      if (typeof value === "string" && allowed.includes(value)) out[k] = value;
    } else if (range) {
      if (typeof value === "number" && Number.isFinite(value))
        out[k] = Math.min(range[1], Math.max(range[0], Math.round(value)));
    } else if (typeof value === "boolean") {
      out[k] = value;
    }
  }
  return out as PartialSettings;
}

export interface ResolvedSettings {
  settings: ReaderSettings;
  /** Where each setting's value comes from. */
  origin: Record<keyof ReaderSettings, Level>;
}

/** Merges the levels over the type's defaults, remembering where each value came from. */
export function resolve(
  type: string | undefined,
  levels: {
    global?: Record<string, unknown> | undefined;
    source?: Record<string, unknown> | undefined;
    work?: Record<string, unknown> | undefined;
  },
): ResolvedSettings {
  const settings = { ...defaultsFor(type) };
  const origin = Object.fromEntries(Object.keys(settings).map((k) => [k, "default"])) as Record<
    keyof ReaderSettings,
    Level
  >;
  for (const level of ["global", "source", "work"] as const) {
    for (const [key, value] of Object.entries(sanitize(levels[level]))) {
      (settings as Record<string, unknown>)[key] = value;
      origin[key as keyof ReaderSettings] = level;
    }
  }
  return { settings, origin };
}

/** Is the mode a continuous scroll (as opposed to page by page)? */
export function isContinuous(mode: Mode): boolean {
  return mode === "vertical" || mode === "webtoon" || mode === "horizontal";
}
