// SPDX-License-Identifier: GPL-3.0-or-later

import type { Page } from "@playwright/test";

/**
 * Scrolls the reader's long strip, the same in every engine (mobile WebKit has no mouse wheel).
 * At its very start there is nothing to scroll up: a wheel event says the reader tried.
 */
export async function scrollStrip(page: Page, by: number): Promise<void> {
  await page.getByTestId("strip-viewer").evaluate((strip, dy) => {
    if (dy < 0 && strip.scrollTop <= 120) strip.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true }));
    strip.scrollBy(0, dy);
  }, by);
}
