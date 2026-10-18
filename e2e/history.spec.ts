// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { scrollStrip } from "./strip";

// What was read shows in History, one line per series, resuming where it's at; on a phone the
// line fits the screen (a long chapter name truncates).
test("reading shows in History, and Resume goes back to it", async ({ page }) => {
  await page.goto("/catalog/ent_1001?mock=ready");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/works\//);
  await page.goto("/");
  await page.locator("main a[href^='/works/']").first().click();
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await scrollStrip(page, 700);
    await page.waitForTimeout(150);
  }
  const reading = page.url();

  await page.goto("/history");
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByText("Moonlit Bakery")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await today.getByRole("link", { name: "Resume Moonlit Bakery" }).click();
  await expect(page.getByTestId("strip-viewer")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(new URL(reading).pathname);
});
