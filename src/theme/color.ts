// SPDX-License-Identifier: GPL-3.0-or-later

/** Parses "#rgb" or "#rrggbb" into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return undefined;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour (near white or near black) that reads best on `hex`. */
export function readableOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  const l = luminance(rgb);
  return contrastRatio(l, 1) >= contrastRatio(l, 0) ? "#ffffff" : "#111111";
}

/** OKLCH (as the presets write it) to sRGB channels 0–255. */
export function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(g * 255);
  }) as [number, number, number];
}

/** A colour as the theme writes it (hex or oklch(), alpha ignored) to sRGB; undefined if unknown. */
export function parseColor(css: string): [number, number, number] | undefined {
  const hex = parseHex(css);
  if (hex) return hex;
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css.trim());
  if (!match) return undefined;
  return oklchToRgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** The contrast between two theme colours (1 to 21), or undefined when one can't be read. */
export function contrast(a: string, b: string): number | undefined {
  const x = parseColor(a);
  const y = parseColor(b);
  return x && y ? contrastRatio(luminance(x), luminance(y)) : undefined;
}

/** Any colour the theme writes, as #rrggbb (for colour pickers); undefined if unknown. */
export function toHex(css: string): string | undefined {
  const rgb = parseColor(css);
  return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}` : undefined;
}
