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
