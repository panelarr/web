// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The metadata service run from Panelarr's admin: a provider's full sync started and watched
// until it's done (meta sends no events: the page polls), then refreshing one entry.
test("a provider's sync, started and watched to the end; an entry refreshed", async ({ page }) => {
  await page.goto("/admin/metadata?tab=providers&mock=ready");
  const provider = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Example Provider" }) });
  await expect(provider).toContainText("Full sync: daily at 03:00 UTC");
  await provider.getByRole("button", { name: "Start a full sync" }).click();
  await page.getByRole("button", { name: "Watch" }).click();
  const heading = page.getByRole("heading", { level: 2, name: /Full sync of example-provider/ });
  await expect(heading).toContainText("Running");
  await expect(heading).toContainText("Succeeded", { timeout: 20_000 });

  await page.goto("/catalog/ent_1001");
  await page.getByRole("button", { name: "Refresh from providers" }).click();
  await expect(page.getByText("Fresh data from example-provider.")).toBeVisible();
});
