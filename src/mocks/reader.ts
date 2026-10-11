// SPDX-License-Identifier: GPL-3.0-or-later

// Pages for the mock reader: generated images, portrait pages for manga with one double
// spread, long strips for webtoons.
import type { components } from "@/api/schema.gen";

type S = components["schemas"];

export function pageCount(chapter: S["UnifiedChapter"]): number {
  return 10 + (Math.round(chapter.number ?? 3) % 5);
}

/** Is page `index` a double spread (wide)? One per manga chapter, to try double-page mode. */
export function isSpread(index: number, strip: boolean): boolean {
  return !strip && index === 5;
}

export function pageSvg(chapter: S["UnifiedChapter"], index: number, strip: boolean): string {
  const spread = isSpread(index, strip);
  const [w, h] = strip ? [800, 2400] : spread ? [1600, 1150] : [800, 1150];
  const hue = Math.round(((chapter.number ?? 0) * 47 + index * 13) % 360);
  const panels = strip
    ? `<rect x="40" y="120" width="720" height="900" rx="8" fill="hsl(${hue} 40% 85%)"/><rect x="40" y="1300" width="720" height="900" rx="8" fill="hsl(${hue} 40% 78%)"/>`
    : `<rect x="40" y="40" width="${w - 80}" height="${h * 0.45}" rx="6" fill="hsl(${hue} 40% 85%)"/><rect x="40" y="${h * 0.5}" width="${(w - 100) / 2}" height="${h * 0.45}" rx="6" fill="hsl(${hue} 40% 78%)"/><rect x="${w / 2 + 10}" y="${h * 0.5}" width="${(w - 100) / 2}" height="${h * 0.45}" rx="6" fill="hsl(${hue} 40% 72%)"/>`;
  const label = `${chapter.number !== undefined ? `Chapter ${chapter.number}` : chapter.title}, page ${index + 1}${spread ? " (spread)" : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fbfaf7"/>${panels}<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="700" fill="#222">${label}</text></svg>`;
}
