// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The mock server's "ready" scenario has a plugin that hosts many sites, with extensions from
// two stores; its tasks move on every second, as on a real server.
test("installs an extension, and its source shows in Sources to be browsed", async ({ page }) => {
  await page.goto("/admin/plugins/stores?tab=extensions&mock=ready");
  await expect(page.getByText(/^64 extensions/)).toBeVisible();

  await page.getByRole("searchbox", { name: "Search extensions" }).fill("Lantern");
  await page.getByRole("button", { name: "Install Lantern Reader" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Installing Lantern Reader" })).toBeVisible();
  await expect(page.getByText("Lantern Reader installed.")).toBeVisible({ timeout: 10_000 });

  // Its details: languages, sources, and the way to them in Sources.
  await page.getByRole("button", { name: "Lantern Reader", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("region", { name: "Its sources" })).toContainText("Lantern Reader");
  await sheet.getByRole("link", { name: "Open in Sources" }).click();

  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByText("via Lantern Reader")).toBeVisible();
  await page.getByRole("link", { name: "Lantern Reader" }).click();
  await expect(page.getByRole("heading", { name: "Lantern Reader" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();
});

test("regular users don't browse sources", async ({ page }) => {
  await page.goto("/browse/sources/example:1001?mock=user");
  await expect(page).toHaveURL(/\/browse$/);
  await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sources", exact: true })).toHaveCount(0);
  await page.goto("/admin/sources");
  await expect(page).toHaveURL(/\/$/);
});
