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

test("runs a job and watches it finish over the live event stream", async ({ page }) => {
  await page.goto("/admin/jobs?mock=ready");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Refresh sources" }) });
  await card.getByRole("button", { name: "Run now" }).click();
  // Progress arrives as server-sent events (the mock server moves the run on every second).
  await expect(card.getByText(/of 5/)).toBeVisible({ timeout: 5000 });
  await expect(card.getByText(/Done: 12 works/)).toBeVisible({ timeout: 10_000 });
});

test("adds a series from a source, then fixes its match on another source", async ({ page }) => {
  await page.goto("/browse/sources/example:1001/series?key=%2Fseries%2F1000&mock=ready");
  await page.getByRole("button", { name: "Add to library" }).click();
  await expect(page).toHaveURL(/\/works\//);
  await page.getByRole("tab", { name: "Sources" }).click();
  // Matching runs on the mock server; the page follows it live.
  const sample = page.locator("li", { has: page.getByText("Sample Scans", { exact: true }) }).first();
  await expect(sample.getByText(/Needs a decision|Search failed/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Attach by URL" }).click();
  await page.getByLabel("Series URL").fill("https://example.com/1002/series/1000");
  await page.getByRole("dialog").getByRole("button", { name: "Attach" }).click();
  await expect(page.getByText("Attached on 2 of 2 sources.")).toBeVisible();

  await page.getByRole("tab", { name: "Chapters" }).click();
  await expect(page.getByRole("list", { name: "Chapters" })).toBeVisible();
  await expect(page.getByText(/\d+ chapters · 0 read/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("reads a chapter: swipe and tap through pages, right to left", async ({ page }) => {
  await page.goto("/catalog/ent_1000?mock=ready");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page.getByText("In your library").filter({ visible: true })).toBeVisible();
  await page.goto("/");
  await page.getByText("The Lantern Keeper").click();
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 10_000 });
  const status = page.locator("[aria-live=polite]").filter({ hasText: /Page \d+ of \d+/ });
  await expect(status).toHaveText(/Page 1 of \d+/);

  // Swipe right to go forward in right-to-left reading.
  const box = (await page.getByTestId("paged-viewer").boundingBox()) ?? { x: 0, y: 0, width: 360, height: 700 };
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
  await page.mouse.up();
  await expect(status).toHaveText(/Page 2 of \d+/);

  // A tap on the left edge also goes forward.
  await page.mouse.click(box.x + 20, y);
  await expect(status).toHaveText(/Page 3 of \d+/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("double page shows a spread on its own", async ({ page, isMobile }) => {
  test.skip(isMobile, "double page is for wide screens");
  await page.goto("/catalog/ent_1000?mock=ready");
  await page.getByRole("button", { name: "Add to library" }).filter({ visible: true }).click();
  await expect(page.getByText("In your library").filter({ visible: true })).toBeVisible();
  await page.goto("/");
  await page.getByText("The Lantern Keeper").click();
  await page.getByRole("link", { name: /Start reading/ }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: "Reader settings" }).click();
  await page.getByLabel(/^Mode/).selectOption("double");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const status = page.locator("[aria-live=polite]").filter({ hasText: /Page \d+ of \d+/ });
  // Cover alone, then 2+3, 4+5; page 6 is a spread, alone.
  for (const expected of ["Page 1", "Page 3", "Page 5", "Page 6"]) {
    await expect(status).toHaveText(new RegExp(`^${expected} of`));
    await page.keyboard.press("ArrowLeft");
  }
  const current = page.locator("[aria-hidden=false]").filter({ has: page.getByAltText("Page 7") });
  await expect(current.getByAltText("Page 8")).toBeVisible();
});
