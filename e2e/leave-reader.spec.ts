// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";
import { scrollStrip } from "./strip";

// Leaving the reader never stacks a new entry: Back from the series page goes where that page was
// opened from (the library, scrolled as it was), not into the reader again.

const TITLE = "Moonlit Bakery";

/** A library long enough to scroll: every catalogue entry, the one to read first. */
async function fillLibrary(page: Page) {
  await page.goto("/?mock=ready");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const ids = Array.from({ length: 24 }, (_, i) => `ent_${1000 + i}`);
    for (const entry_id of ["ent_1001", ...ids.filter((id) => id !== "ent_1001")]) {
      const response = await fetch("/api/v1/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id }),
      });
      if (!response.ok) throw new Error(`adding ${entry_id}: ${response.status}`);
    }
  });
  // Without `?mock=`, which would start the scenario over.
  await page.goto("/");
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/** Scrolls the library to the series and opens it; says where the library was scrolled to. */
async function openSeriesFromLibrary(page: Page): Promise<number> {
  const card = page.locator("main a[href^='/works/']").filter({ hasText: TITLE });
  await card.scrollIntoViewIfNeeded();
  // Further down still, so the page is scrolled whatever the layout puts first.
  await page.evaluate(() => window.scrollBy(0, 120));
  await card.scrollIntoViewIfNeeded();
  const at = await scrollY(page);
  expect(at).toBeGreaterThan(0);
  await card.click();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  return at;
}

async function startReading(page: Page) {
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
}

async function closeTheReader(page: Page) {
  const close = page.getByRole("link", { name: "Close the reader" });
  // A tap in the middle shows the bars; they hide once reading moves on, maybe right then.
  await expect(async () => {
    if (!(await close.isVisible())) await page.getByTestId("strip-viewer").click();
    await close.click({ timeout: 2_000 });
  }).toPass();
}

/** On the series page: its Back leads to the library, at `at` (scroll) when given. */
async function backToLibrary(page: Page, at?: number) {
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page).toHaveURL(/\/works\/[^/?]+$/);
  await page.getByRole("button", { name: "Back" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  if (at !== undefined) await expect.poll(() => scrollY(page)).toBe(at);
}

test.describe("leaving the reader", () => {
  test.beforeEach(async ({ page }) => {
    await fillLibrary(page);
  });

  test("closing it goes back to the series, whose Back returns to the library where it was", async ({ page }) => {
    const at = await openSeriesFromLibrary(page);
    await startReading(page);
    await closeTheReader(page);
    await backToLibrary(page, at);
  });

  test("Escape does the same", async ({ page }) => {
    const at = await openSeriesFromLibrary(page);
    await startReading(page);
    // Escape first hides the bars when they show, then leaves.
    const close = page.getByRole("link", { name: "Close the reader" });
    if (await close.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(close).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await backToLibrary(page, at);
  });

  test("after reading on into the next chapter, too", async ({ page }) => {
    const at = await openSeriesFromLibrary(page);
    await startReading(page);
    const first = page.url();
    for (let i = 0; i < 80 && page.url() === first; i++) {
      await scrollStrip(page, 700);
      await page.waitForTimeout(120);
    }
    expect(page.url()).not.toBe(first);
    await closeTheReader(page);
    await backToLibrary(page, at);
  });

  test("opened directly, the series page takes its place and Back leads to the library", async ({ page }) => {
    // Learn a chapter's address from the series, then load it as a link from elsewhere would.
    await openSeriesFromLibrary(page);
    await startReading(page);
    const chapter = new URL(page.url()).pathname;
    await page.goto(chapter);
    await expect(page.getByTestId("strip-viewer")).toBeVisible();
    await closeTheReader(page);
    await backToLibrary(page);
  });
});
