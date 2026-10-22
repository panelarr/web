// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";
import { scrollStrip } from "./strip";

// Page images arrive slowly and in any order, and long-strip pages vary in height (the mock's
// slow-pages scenario): the page being read must not move while the strip fills in around it.

async function openStrip(page: Page) {
  await page.goto("/catalog/ent_1001?mock=slow-pages");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  // Adding it moves on to the series in the library.
  await expect(page).toHaveURL(/\/works\//);
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

test("and while the previous chapter is added above, before the reader scrolls up to it", async ({ page }) => {
  await openStrip(page);
  const first = chapterOf(page.url());
  for (let i = 0; i < 120 && chapterOf(page.url()) === first; i++) {
    await scrollStrip(page, 700);
    await page.waitForTimeout(80);
  }
  const second = chapterOf(page.url());
  expect(second).not.toBe(first);
  // From the first frame: the item in the middle of the screen, where it is, and whether the
  // chapter before has been added above yet.
  await page.addInitScript(() => {
    const samples: Array<{ key: string; top: number; next: number | undefined; above: boolean }> = [];
    Object.assign(window, { __samples: samples });
    let last: string | undefined;
    const frame = () => {
      const strip = document.querySelector("[data-testid=strip-viewer]");
      if (strip) {
        const box = strip.getBoundingClientRect();
        const at = (key: string | undefined) =>
          key ? strip.querySelector(`[data-key="${CSS.escape(key)}"]`)?.getBoundingClientRect().top : undefined;
        const prev = samples.at(-1);
        // Gone in the next frame counts too (a blank frame): NaN fails the comparison below.
        if (prev) prev.next = at(last) ?? Number.NaN;
        const item = document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest<HTMLElement>("[data-key]");
        last = item?.dataset.key;
        if (last)
          samples.push({
            key: last,
            top: at(last) ?? Number.NaN,
            next: undefined,
            above: !!strip.querySelector("[data-key^='between:']"),
          });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  // Open the second chapter on its own, at its start: the one before is added above by itself.
  await page.goto(`/read/${second}?page=0`);
  await expect(page.locator(`[data-key="between:${first}"]`)).toBeAttached();
  await page.waitForTimeout(1000);
  const samples = await page.evaluate(
    () => (window as unknown as { __samples: Array<{ top: number; next?: number; above: boolean }> }).__samples,
  );
  // Seen before and after it was added, and nothing under the middle of the screen moved from
  // one frame to the next.
  expect(samples.some((s) => !s.above)).toBe(true);
  expect(samples.some((s) => s.above)).toBe(true);
  const jumps = samples.slice(0, -1).map((s) => Math.abs((s.next ?? Number.NaN) - s.top));
  expect(Math.max(...jumps)).toBeLessThanOrEqual(3);
  expect(chapterOf(page.url())).toBe(second);
  // Scrolling up goes on into it.
  for (let i = 0; i < 10 && chapterOf(page.url()) === second; i++) {
    await scrollStrip(page, -400);
    await page.waitForTimeout(120);
  }
  expect(chapterOf(page.url())).toBe(first);
});
