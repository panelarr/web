// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The mock server's "fresh" scenario: a new install with no accounts.
test("sets up a new install and lands in the library", async ({ page }) => {
  await page.goto("/?mock=fresh");
  await expect(page.getByRole("heading", { name: "Create the admin account" })).toBeVisible();
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password", { exact: true }).fill("a-good-password");
  await page.getByLabel("Repeat the password").fill("a-good-password");
  await page.getByRole("button", { name: "Create and continue" }).click();

  await page.getByLabel("Metadata service URL").fill("http://meta:8901");
  await page.getByLabel("Admin API key").fill("meta-admin-key");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("A metadata provider has entries")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
});

test("signs in and out", async ({ page, isMobile }) => {
  await page.goto("/settings?mock=signed-out");
  await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

  if (isMobile) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "More" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
  } else {
    await page.getByRole("button", { name: /Admin/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
  }
  await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();
});

test("the sign-in and setup pages fit a phone", async ({ page }) => {
  for (const path of ["/login?mock=signed-out", "/?mock=fresh", "/settings?tab=api-keys&mock=ready"]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} is wider than the screen`).toBeLessThanOrEqual(0);
  }
});

test("finds a work in the catalogue and adds it", async ({ page }) => {
  await page.goto("/browse?mock=ready");
  await page.getByRole("searchbox", { name: "Search the catalogue" }).fill("lantern");
  await page.getByRole("link", { name: /The Lantern Keeper/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Lantern Keeper" })).toBeVisible();
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page.getByText("In your library").filter({ visible: true })).toBeVisible();
});
