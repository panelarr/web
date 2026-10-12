// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The metadata service run from Panelarr's admin: a provider's full sync started and watched
// until it's done (meta sends no events: the page polls), then refreshing one entry.
test("a provider's sync, started and watched to the end; an entry refreshed", async ({ page }) => {
  await page.goto("/admin/metadata?tab=providers&mock=ready");
  const provider = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Example Provider" }) });
  await expect(provider).toContainText("Full sync: daily at 03:00 UTC");
  await provider.getByRole("button", { name: "Start a full sync" }).click();
  // The run shows among the provider's last runs (the toast's Watch does the same, but goes away).
  await provider.getByRole("list", { name: "Last runs" }).getByRole("link").filter({ hasText: "Running" }).click();
  const heading = page.getByRole("heading", { level: 2, name: /Full sync of example-provider/ });
  await expect(heading).toContainText("Running");
  await expect(heading).toContainText("Succeeded", { timeout: 20_000 });

  await page.goto("/catalog/ent_1001");
  await page.getByRole("button", { name: "Refresh from providers" }).click();
  await expect(page.getByText("Fresh data from example-provider.")).toBeVisible();
});

test("a suspected duplicate reviewed and merged; the decision model tested", async ({ page }) => {
  await page.goto("/admin/metadata?tab=duplicates&mock=ready");
  const list = page.getByRole("list", { name: "Pairs" });
  await expect(list.getByRole("link")).toHaveCount(4);
  await list.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 2, name: "94% alike" })).toBeVisible();
  await page.getByRole("button", { name: "Merge" }).click();
  const merge = page.getByRole("dialog", { name: "Merge into one entry?" });
  await merge.getByRole("button", { name: "Merge for good" }).click();
  await expect(page.getByText(/Merged: .* stays\./)).toBeVisible();
  await expect(list.getByRole("link")).toHaveCount(3);

  await page.getByRole("button", { name: "Settings" }).click();
  const judge = page.getByRole("dialog", { name: "Decision model" });
  await judge.getByRole("button", { name: "Test" }).click();
  await expect(judge.getByRole("status")).toContainText("It answered: same work");
});
