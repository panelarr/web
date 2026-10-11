// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

test("loads the library and moves between pages", async ({ page, isMobile }) => {
  await page.goto("/?mock=ready");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toHaveCount(1); // only the layout for this screen size is shown
  await nav.getByRole("link", { name: "Browse" }).click();
  await expect(page.getByRole("heading", { name: "Browse", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/browse$/);
  if (isMobile) {
    await nav.getByRole("link", { name: "More" }).click();
    await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  } else {
    await nav.getByRole("link", { name: "Settings" }).click();
  }
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("never scrolls sideways", async ({ page }) => {
  await page.goto("/?mock=ready");
  for (const path of ["/", "/browse", "/downloads", "/settings", "/settings?tab=security", "/more", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} is wider than the screen`).toBeLessThanOrEqual(0);
  }
});

test("shows the server version from the (mock) API", async ({ page, isMobile }) => {
  test.skip(isMobile, "the version is in the desktop sidebar");
  await page.goto("/?mock=ready");
  await expect(page.getByText("Server dev")).toBeVisible();
});

test("keeps the chosen theme across reloads, applied before the app starts", async ({ page }) => {
  await page.goto("/settings?tab=appearance&mock=ready");
  await page.getByText("True black").click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Block the app's script: whatever theme shows now came from theme-boot.js.
  await page.route(/\/src\/main\.tsx/, (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const background = await page.evaluate(() => document.documentElement.style.getPropertyValue("--background"));
  expect(background).toBe("oklch(0 0 0)");
});
