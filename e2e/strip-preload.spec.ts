// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";
import { IN_FLIGHT } from "../src/features/reader/page-loader";
import { scrollStrip } from "./strip";

// A long strip loads as many pages past the screen as the reader asks for ("Pages to load
// ahead"), in reading order and a few at a time, into the next chapter when this one ends sooner.
// Page images arrive slowly and in any order here (the mock's slow-pages scenario).

/** More than the strip renders past the screen, and past the first chapter's end. */
const AHEAD = 12;
const PAGE = /\/chapters\/([^/]+)\/pages\/(\d+)$/;

/**
 * The page images the app asks the browser for, in that order (requests started together can
 * reach the network in any order), and what reaches the network: each request, and the most at once.
 */
async function watchPages(page: Page) {
  await page.addInitScript(() => {
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    const asked: string[] = [];
    Object.assign(window, { askedPages: asked });
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...src,
      set(url: string) {
        if (/\/pages\/\d+$/.test(url)) asked.push(new URL(url, location.href).pathname);
        src?.set?.call(this, url);
      },
    });
  });
  const started: string[] = [];
  const open = new Set<string>();
  let most = 0;
  page.on("request", (request) => {
    const match = PAGE.exec(new URL(request.url()).pathname);
    if (!match) return;
    started.push(`${match[1]}:${match[2]}`);
    open.add(request.url());
    most = Math.max(most, open.size);
  });
  const end = (request: { url: () => string }) => open.delete(request.url());
  page.on("requestfinished", end);
  page.on("requestfailed", end);
  const asked = async () =>
    [...new Set(await page.evaluate(() => (window as unknown as { askedPages: string[] }).askedPages))].map((path) => {
      const [, chapter, index] = PAGE.exec(path) ?? [];
      return `${chapter}:${index}`;
    });
  return { started, asked, most: () => most, open: () => open.size };
}

test("loads the pages ahead the reader asks for, in order, a few at a time", async ({ page }) => {
  await page.goto("/catalog/ent_1001?mock=slow-pages");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  // Adding it moves on to the series in the library.
  await expect(page).toHaveURL(/\/works\//);
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  // A tap in the middle shows the reader's menu.
  await page.getByTestId("strip-viewer").click();
  await page.getByRole("button", { name: "Reader settings" }).click();
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByLabel("Pages to load ahead").fill(String(AHEAD));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Opened afresh with the setting, once nothing of the reader is left.
  const reader = page.url();
  await page.goto("about:blank");
  const pages = await watchPages(page);
  await page.goto(reader);
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  const chapter = /\/read\/([^/?]+)/.exec(page.url())?.[1] ?? "";
  const status = page.getByRole("application").locator("[aria-live=polite]");
  await expect(status).toHaveText(/Page 1 of \d+/);
  const length = Number(/of (\d+)/.exec((await status.textContent()) ?? "")?.[1]);

  // The pages on screen, by their place in the strip.
  const shown = await page.getByTestId("strip-viewer").evaluate((strip) => {
    const box = strip.getBoundingClientRect();
    return [...strip.querySelectorAll<HTMLElement>("[data-key]")]
      .filter((item) => /:\d+$/.test(item.dataset.key ?? ""))
      .filter((item) => {
        const r = item.getBoundingClientRect();
        return r.bottom > box.top && r.top < box.bottom;
      }).length;
  });
  expect(shown).toBeGreaterThan(0);
  const wanted = shown + AHEAD;
  await expect.poll(() => pages.started.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(wanted);
  await expect.poll(() => pages.open(), { timeout: 10_000 }).toBe(0);
  // Settled: nothing more is asked for.
  await page.waitForTimeout(1_000);
  expect(pages.started).toHaveLength(wanted);

  // Each fetched once: a page's own image shows what was loaded ahead.
  expect(new Set(pages.started).size).toBe(wanted);
  // This chapter's pages in order, then the next one's from its start.
  const asked = await pages.asked();
  expect(asked).toHaveLength(wanted);
  const inThis = Math.min(length, wanted);
  expect(asked.slice(0, inThis)).toEqual(Array.from({ length: inThis }, (_, i) => `${chapter}:${i}`));
  const next = asked.slice(inThis);
  expect(next.map((key) => key.split(":")[1])).toEqual(next.map((_, i) => String(i)));
  expect(new Set(next.map((key) => key.split(":")[0])).size).toBeLessThanOrEqual(1);
  expect(pages.most()).toBeLessThanOrEqual(IN_FLIGHT);

  // A page loaded ahead, not rendered yet, is there at once when the reader gets to it.
  const last = Math.min(length, wanted) - 1;
  const item = page.locator(`[data-key="${chapter}:${last}"]`);
  await expect(item).toHaveCount(0);
  for (let i = 0; i < 100 && (await item.count()) === 0; i++) await scrollStrip(page, 600);
  await expect(item.getByLabel(/^Loading page/)).toHaveCount(0);
  await expect(item.getByAltText(`Page ${last + 1}`)).toBeVisible();
  expect(pages.started.filter((key) => key === `${chapter}:${last}`)).toHaveLength(1);
});
