// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";

const card = (page: Page, name: string) =>
  page.locator("[data-slot=card]", { has: page.getByRole("heading", { name, exact: true }) });

// The same Jobs screens for a plugin's jobs and the metadata service's, end to end against the
// mock server. Neither sends events: the app polls while a run goes on.
test("a plugin's job, run from its page and followed until it's done", async ({ page }) => {
  await page.goto("/admin/plugins/stores?tab=jobs&mock=ready");
  const refresh = card(page, "Refresh stores");
  await refresh.getByRole("button", { name: "Run now" }).click();
  await expect(refresh.getByText("Running")).toBeVisible();
  await expect(refresh.getByText("Done: 12 works, 3 new chapters")).toBeVisible({ timeout: 20_000 });

  await refresh.getByRole("link", { name: "Refresh stores: runs" }).click();
  await page.getByText("Done: 12 works, 3 new chapters").click();
  await expect(page.getByRole("heading", { name: "Outcome" })).toBeVisible();
  await expect(page.getByText(/by hand by admin/)).toBeVisible();
});

test("the metadata service's job, watched on its run page until it's done", async ({ page }) => {
  await page.goto("/admin/metadata?tab=jobs&mock=ready");
  const rebuild = card(page, "Rebuild the search index");
  await rebuild.getByRole("button", { name: "Run now" }).click();
  await rebuild.getByRole("link", { name: "Watch" }).click();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Run/ })).toContainText("Succeeded", { timeout: 20_000 });
});
