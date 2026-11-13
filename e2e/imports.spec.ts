// SPDX-License-Identifier: GPL-3.0-or-later

import { gzipSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Importing from another app's backup on a desktop and a phone: the upload, matching followed
// live (and across a reload), the preview's totals, tabs and hints, and deleting the import.
// The mock server can't read a backup: any gzip file holds the same made-up library of 42 series.

/** A made-up backup: gzip, like a real one; `seed` makes each one a different file. */
function backup(seed: string) {
  return {
    name: "library.tachibk",
    mimeType: "application/octet-stream",
    buffer: gzipSync(Buffer.from(`made-up backup ${seed}`)),
  };
}

async function openImport(page: Page, scenario = "ready") {
  await page.goto(`/settings?tab=import&mock=${scenario}`);
  await expect(page.getByText("Import from Suwayomi or Mihon")).toBeVisible();
  await expect(page.getByText("No imports yet")).toBeVisible();
}

/** Nothing wider than the screen (a phone's emulation widens `innerWidth` to fit, so not that). */
async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("upload a backup, follow the matching and review the preview", async ({ page, isMobile }) => {
  await openImport(page);
  await noSidewaysScroll(page);
  await page.getByLabel("Backup file").setInputFiles(backup(`one ${test.info().project.name}`));

  await expect(page).toHaveURL(/\/settings\/imports\/[0-9a-f-]+$/);
  const state = page.getByTestId("import-state");
  // The totals are there from the start; matching moves on with events.
  await expect(page.getByRole("region", { name: "Totals" })).toContainText("42");
  await expect(state).toHaveText("Ready to review", { timeout: 20_000 });

  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveText([
    "Ready30",
    "Already in library3",
    "Needs a choice2",
    "Not found2",
    "Source missing4",
    "Not allowed1",
  ]);
  await expect(page.getByText("Categories aren't imported yet: 3 categories")).toBeVisible();
  await expect(page.getByText(/Installing Lantern Reader would attach 4 series/)).toBeVisible();
  await noSidewaysScroll(page);

  // A tab's series come a page at a time.
  const series = page.getByRole("list", { name: "Series" });
  await expect(series.getByRole("listitem")).toHaveCount(25);
  await page.getByRole("button", { name: "More series" }).click();
  await expect(series.getByRole("listitem")).toHaveCount(30);

  // The tab is in the URL and survives a reload, like everything else on the page.
  await tabs.getByRole("tab", { name: /Not allowed/ }).click();
  await expect(page).toHaveURL(/outcome=not_allowed/);
  await expect(page.getByText("This work is above your content rating limit.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: /Not allowed/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("This work is above your content rating limit.")).toBeVisible();
  await noSidewaysScroll(page);

  if (!isMobile) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }

  // Admins go straight to the package.
  await page.getByRole("link", { name: "Open Lantern Reader in Extensions" }).click();
  await expect(page).toHaveURL(/\/admin\/plugins\/stores\?tab=extensions&pkg=org\.example\.lantern/);
  await page.goBack();

  // Deleting it asks first, then goes back to the list.
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Nothing in your library changes.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/settings\?tab=import$/);
  await expect(page.getByText("No imports yet")).toBeVisible();
});

test("matching goes on across a reload, and the list shows it", async ({ page }) => {
  await openImport(page);
  await page.getByLabel("Backup file").setInputFiles(backup(`two ${test.info().project.name}`));
  await expect(page).toHaveURL(/\/settings\/imports\//);
  const url = page.url();
  await page.reload();
  await expect(page.getByTestId("import-state")).toHaveText("Ready to review", { timeout: 20_000 });
  expect(page.url()).toBe(url);

  await page.getByRole("link", { name: "Imports" }).click();
  const list = page.getByRole("list", { name: "Your imports" });
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list).toContainText("42 series");
  await expect(list).toContainText("Ready to review");

  // The same file again opens that import instead of a new one.
  await page.getByLabel("Backup file").setInputFiles(backup(`two ${test.info().project.name}`));
  await expect(page.getByText("You imported this file before: here is that import.")).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("a file that isn't a backup is refused", async ({ page }) => {
  await openImport(page);
  await page.getByLabel("Backup file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a backup"),
  });
  await expect(page.getByText("That file isn't a backup Panelarr can read")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?tab=import/);
  await noSidewaysScroll(page);
});

test("users who aren't admins are told to ask one", async ({ page }) => {
  await openImport(page, "user");
  await page.getByLabel("Backup file").setInputFiles(backup(`three ${test.info().project.name}`));
  await expect(page.getByTestId("import-state")).toHaveText("Ready to review", { timeout: 20_000 });
  await expect(page.getByText(/Ask an admin to install it/)).toBeVisible();
  await expect(page.getByRole("link", { name: /in Extensions/ })).toHaveCount(0);
});
