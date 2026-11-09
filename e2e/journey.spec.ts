// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The first version end to end, on a new install: set up, add a work, read, download.
test("set up, add, read, download", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?mock=fresh");

  // Setup.
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password", { exact: true }).fill("a-good-password");
  await page.getByLabel("Repeat the password").fill("a-good-password");
  await page.getByRole("button", { name: "Create and continue" }).click();
  await page.getByLabel("Metadata service URL").fill("http://meta:8901");
  await page.getByLabel("Admin API key").fill("meta-admin-key");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await page.getByRole("button", { name: "Check again" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Plugin URL").fill("http://example-plugin:8904");
  await page.getByRole("button", { name: "Add plugin" }).click();
  await expect(page.getByText("Example Source Plugin")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  // Find a work in the catalogue and add it; matching runs on the plugin's sources.
  await page.goto("/browse");
  await page.getByRole("searchbox", { name: "Search the catalogue" }).fill("lantern");
  await page.getByRole("link", { name: /The Lantern Keeper/ }).click();
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  // It opens on its sources, where matching shows.
  await expect(page).toHaveURL(/\/works\/[^/?]+\?tab=sources$/);
  await expect(page.getByRole("tab", { name: "Sources", selected: true })).toBeVisible();

  // The work page.
  await page.goto("/");
  await page.getByText("The Lantern Keeper").click();
  await expect(page.getByRole("heading", { name: "The Lantern Keeper" })).toBeVisible();

  // Read: chapters appear once matching attached a source.
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 15_000 });
  const status = page.locator("[aria-live=polite]").filter({ hasText: /Page \d+ of \d+/ });
  await expect(status).toHaveText(/Page 1 of/);
  await page.keyboard.press("ArrowLeft");
  await expect(status).toHaveText(/Page 2 of/);
  // Esc leaves the reader (the bars hide while reading).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "The Lantern Keeper" })).toBeVisible();

  // Download.
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: "Unread chapters" }).click();
  await expect(page.getByText(/Downloads: \d+ queued/)).toBeVisible();
  await page.goto("/downloads?state=succeeded");
  await expect(page.getByText("The Lantern Keeper").first()).toBeVisible({ timeout: 20_000 });
});
