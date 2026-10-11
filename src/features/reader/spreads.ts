// SPDX-License-Identifier: GPL-3.0-or-later

/** A page is a double spread when it is wider than tall (two pages printed as one). */
export function isSpread(size: { width: number; height: number } | undefined): boolean {
  return size !== undefined && size.width > size.height * 1.05;
}

/**
 * Pairs pages for double-page reading. A spread is shown alone; with `offset`, so is the first
 * page (the cover), which keeps printed pairs together; any other page pairs with the next one
 * unless that one is a spread. Pages whose size isn't known yet count as single pages.
 */
export function pairPages(count: number, spread: (index: number) => boolean, offset: boolean): number[][] {
  const views: number[][] = [];
  let i = 0;
  if (offset && count > 0) {
    views.push([0]);
    i = 1;
  }
  while (i < count) {
    if (spread(i) || i + 1 >= count || spread(i + 1)) {
      views.push([i]);
      i += 1;
    } else {
      views.push([i, i + 1]);
      i += 2;
    }
  }
  return views;
}

/** The view that shows `page`: -1 before the first, `views.length` after the last. */
export function viewOf(views: number[][], page: number): number {
  if (page < 0) return -1;
  const found = views.findIndex((view) => view.includes(page));
  return found >= 0 ? found : views.length;
}
