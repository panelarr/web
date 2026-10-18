// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";
import { scrollStrip } from "./strip";

// Page images arrive slowly and in any order, and long-strip pages vary in height (the mock's
// slow-pages scenario): the page being read must not move while the strip fills in around it.

async function openStrip(page: Page) {
  await page.goto("/catalog/ent_1001?mock=slow-pages");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/works\//);
  await page.goto("/");
  await page.locator("main a[href^='/works/']").first().click();
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
}

/** The strip item in the middle of the screen, and where its top is. */
async function middleItem(page: Page): Promise<{ key: string; top: number }> {
  return page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const item = element?.closest<HTMLElement>("[data-key]");
    return { key: item?.dataset.key ?? "", top: item?.getBoundingClientRect().top ?? Number.NaN };
  });
}

/** How far that item's top moves over `ms` while nothing scrolls (sampled every 50 ms). */
async function drift(page: Page, key: string, from: number, ms: number): Promise<number> {
  return page.evaluate(
    async ({ key, from, ms }) => {
      let worst = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        const top = document.querySelector(`[data-key="${CSS.escape(key)}"]`)?.getBoundingClientRect().top;
        if (top !== undefined) worst = Math.max(worst, Math.abs(top - from));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return worst;
    },
    { key, from, ms },
  );
}

const chapterOf = (url: string) => /\/read\/([^/?]+)/.exec(url)?.[1];

test("the page being read stays put while the pages around it load", async ({ page }) => {
  await openStrip(page);
  await scrollStrip(page, 2500);
  await page.waitForTimeout(150);
  const { key, top } = await middleItem(page);
  expect(key).not.toBe("");
  expect(await drift(page, key, top, 3000)).toBeLessThanOrEqual(3);
});

test("and while the next chapter is added below", async ({ page }) => {
  await openStrip(page);
  const first = chapterOf(page.url());
  const status = page.getByRole("application").locator("[aria-live=polite]");
  // Read on to the last pages: the next chapter loads below.
  for (let i = 0; i < 60; i++) {
    const text = (await status.textContent()) ?? "";
    const [, at, of] = /Page (\d+) of (\d+)/.exec(text) ?? [];
    if (at && of && Number(at) >= Number(of) - 2) break;
    await scrollStrip(page, 600);
    await page.waitForTimeout(100);
  }
  const { key, top } = await middleItem(page);
  expect(await drift(page, key, top, 2500)).toBeLessThanOrEqual(3);
  expect(chapterOf(page.url())).toBe(first);
});

test("and while the previous chapter is added above", async ({ page }) => {
  await openStrip(page);
  const first = chapterOf(page.url());
  for (let i = 0; i < 120 && chapterOf(page.url()) === first; i++) {
    await scrollStrip(page, 700);
    await page.waitForTimeout(80);
  }
  const second = chapterOf(page.url());
  expect(second).not.toBe(first);
  // Open the second chapter on its own, at its start: nothing is loaded above it until the
  // reader asks for it.
  await page.goto(`/read/${second}?page=0`);
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.locator("[data-key^='between:']").count()).toBe(0);
  // A wheel up at the very top asks for the chapter before; what's on screen stays put. (The
  // event alone, without the browser's own scrolling, which would move the page on purpose.)
  const { key, top } = await middleItem(page);
  await page
    .getByTestId("strip-viewer")
    .evaluate((strip) => strip.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true })));
  expect(await drift(page, key, top, 2500)).toBeLessThanOrEqual(3);
  await expect(page.locator(`[data-key="between:${first}"]`)).toBeAttached();
  expect(chapterOf(page.url())).toBe(second);
});
