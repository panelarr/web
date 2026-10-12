// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";

/** A webtoon-type work in the library, opened in the reader (a long strip by its type). */
async function openStrip(page: Page) {
  await page.goto("/catalog/ent_1001?mock=ready");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page.getByText("In your library").filter({ visible: true })).toBeVisible();
  await page.goto("/");
  await page.locator("main a[href^='/works/']").first().click();
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
}

const chapterOf = (url: string) => /\/read\/([^/?]+)/.exec(url)?.[1];

test("a long strip reads on into the next chapter, without a click", async ({ page }) => {
  await openStrip(page);
  const strip = page.getByTestId("strip-viewer");
  const status = page.getByRole("application").locator("[aria-live=polite]");
  const first = chapterOf(page.url());

  // The chapter's start is a small band, not a screen: the first page is right there.
  const band = await page.locator("[data-reader-edge=start]").boundingBox();
  expect(band?.height ?? 999).toBeLessThan(200);
  await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();

  // Scroll on: the pages follow one another, then the next chapter's.
  await page.mouse.move(180, 400);
  for (let i = 0; i < 80 && chapterOf(page.url()) === first; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
  }
  expect(chapterOf(page.url())).not.toBe(first);
  await expect(status).toHaveText(/Page \d+ of \d+|Start of the chapter/);
  // Only a band between them, with the chapter that ended.
  await expect(strip.locator("[data-reader-edge=end]").first()).toContainText("End of");

  // Leaving: the work goes on from the new chapter, the first one read.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible();
});

test("scrolling up past a chapter's start loads the one before it", async ({ page }) => {
  await openStrip(page);
  const first = chapterOf(page.url());
  await page.mouse.move(180, 400);
  for (let i = 0; i < 80 && chapterOf(page.url()) === first; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
  }
  const second = chapterOf(page.url());
  expect(second).not.toBe(first);
  // Open the second chapter on its own, then scroll up into the first.
  await page.goto(`/read/${second}`);
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  for (let i = 0; i < 60 && chapterOf(page.url()) === second; i++) {
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(150);
  }
  expect(chapterOf(page.url())).toBe(first);
});
