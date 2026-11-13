// SPDX-License-Identifier: GPL-3.0-or-later

import { gzipSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Importing from another app's backup on a desktop and a phone (and iOS Safari's engine): the
// upload, matching followed live (and across a reload), the preview's totals, tabs and hints,
// applying it, its report, choosing the work of a series by hand, cancelling and resuming, and
// deleting the import. The mock server can't read a backup: any gzip file holds the same made-up
// library of 42 series; it matches 12 series a second and applies 5.

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

/** Uploads a backup and waits for its preview. */
async function previewed(page: Page, seed: string) {
  await page.getByLabel("Backup file").setInputFiles(backup(seed));
  await expect(page).toHaveURL(/\/settings\/imports\/[0-9a-f-]+/);
  await expect(page.getByTestId("import-state")).toHaveText("Ready to review", { timeout: 20_000 });
}

/** Applies the import shown, after the question. */
async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply import" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/\d+ series go into your library/);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

/** The number under a report tile. */
function reportCount(page: Page, name: string) {
  const report = page.getByRole("region", { name: "Report" });
  return report.locator("div", { has: page.getByText(name, { exact: true }) }).locator("dd");
}

test("AC1: upload, preview, apply and the report", async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  await openImport(page);
  await previewed(page, `apply ${test.info().project.name}`);
  await apply(page);

  // Progress comes from events, and the page can be left meanwhile.
  await expect(page.getByTestId("import-state")).toHaveText("Importing");
  await expect(page.getByRole("progressbar", { name: "Importing series" })).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page.getByTestId("import-state")).toHaveText("Imported", { timeout: 30_000 });

  await expect(reportCount(page, "Imported")).toHaveText("37");
  await expect(reportCount(page, "Already imported")).toHaveText("0");
  await expect(reportCount(page, "Skipped")).toHaveText("0");
  await expect(page.getByText("2 last-read times in the future")).toBeVisible();
  const series = page.getByRole("list", { name: "Series" });
  await expect(series.getByText(/2 waiting for their chapters/).first()).toBeVisible();
  await expect(series.getByText(/kept the series already attached on this source/)).toBeVisible();
  await noSidewaysScroll(page);
  if (!isMobile) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }

  // The works are in the library now (the backup's 37 series are 24 works of the catalogue).
  await page.goto("/");
  await expect(page.getByText("24 works")).toBeVisible();
  await expect(page.getByText("A Quiet Spell").first()).toBeVisible();
});

test("AC5: applying the same backup again says already imported", async ({ page }) => {
  test.setTimeout(120_000);
  const seed = `again ${test.info().project.name}`;
  await openImport(page);
  await previewed(page, seed);
  await apply(page);
  await expect(page.getByTestId("import-state")).toHaveText("Imported", { timeout: 30_000 });

  // Delete the import (what it brought stays), then upload the same file again.
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("What it already brought into your library stays there.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No imports yet")).toBeVisible();
  await previewed(page, seed);
  await apply(page);
  await expect(page.getByTestId("import-state")).toHaveText("Imported", { timeout: 30_000 });
  await expect(reportCount(page, "Already imported")).toHaveText("37");
  await expect(reportCount(page, "Imported")).toHaveText("0");
  await expect(page.getByRole("list", { name: "Series" }).getByText("Already imported").first()).toBeVisible();
});

test("AC9: choose the work of a series, before and after apply, or skip it", async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  await openImport(page);
  await previewed(page, `choose ${test.info().project.name}`);

  // Before apply: a candidate; the series waits for apply in Ready.
  await page.getByRole("tab", { name: /Needs a choice/ }).click();
  const series = page.getByRole("list", { name: "Series" });
  await series
    .getByRole("button", { name: /Choose the work for/ })
    .first()
    .click();
  let dialog = page.getByRole("dialog", { name: "Choose the work" });
  await expect(dialog.getByRole("region", { name: "Possible matches" })).toContainText("82% alike");
  await expect(
    dialog.getByRole("list", { name: "Catalogue results" }).or(dialog.getByText(/Nothing found/)),
  ).toBeVisible();
  await noSidewaysScroll(page);
  if (!isMobile) {
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }
  await dialog.getByRole("button", { name: "Choose Paper Kites Over Harbor Town" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { name: /Needs a choice/ })).toHaveText("Needs a choice1");
  await expect(page.getByRole("tab", { name: /Ready/ })).toHaveText("Ready31");

  // Skip the other one.
  await series.getByRole("button", { name: /Choose the work for/ }).click();
  dialog = page.getByRole("dialog", { name: "Choose the work" });
  await dialog.getByRole("button", { name: "Skip this series" }).click();
  await expect(series.getByText("Skipped")).toBeVisible();

  await apply(page);
  await expect(page.getByTestId("import-state")).toHaveText("Imported", { timeout: 30_000 });

  // After apply: search the catalogue; the series is imported at once.
  await page.getByRole("tab", { name: /Not found/ }).click();
  await series
    .getByRole("button", { name: /Choose the work for/ })
    .first()
    .click();
  dialog = page.getByRole("dialog", { name: "Choose the work" });
  const field = dialog.getByRole("searchbox", { name: "Search the catalogue" });
  await field.fill("Glass");
  await dialog
    .getByRole("list", { name: "Catalogue results" })
    .getByRole("button", { name: "Choose Glass Sea" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { name: /Not found/ })).toHaveText("Not found1");
  await expect(reportCount(page, "Imported")).toHaveText("39");
  await expect(reportCount(page, "Skipped")).toHaveText("1");
});

test("AC12: cancel while applying, reload, and resume", async ({ page }) => {
  test.setTimeout(90_000);
  await openImport(page);
  await previewed(page, `cancel ${test.info().project.name}`);
  await apply(page);
  await expect(page.getByTestId("import-state")).toHaveText("Importing");
  // The progress survives a reload.
  await expect(page.getByText(/Importing series: [1-9]\d* of 42/)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("import-state")).toHaveText("Importing");
  await expect(page.getByText(/Importing series: \d+ of 42/)).toBeVisible();

  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(page.getByTestId("import-state")).toHaveText("Cancelled");
  await expect(page.getByText("The import stopped before it was done.")).toBeVisible();
  const applied = Number(await reportCount(page, "Imported").textContent());
  expect(applied).toBeGreaterThan(0);
  expect(applied).toBeLessThan(37);
  await noSidewaysScroll(page);

  // Cancelled stays cancelled across a reload; resume goes on with the rest.
  await page.reload();
  await expect(page.getByTestId("import-state")).toHaveText("Cancelled");
  await page.getByRole("button", { name: "Resume import" }).click();
  await expect(page.getByTestId("import-state")).toHaveText("Importing");
  await expect(page.getByTestId("import-state")).toHaveText("Imported", { timeout: 30_000 });
  await expect(reportCount(page, "Imported")).toHaveText("37");
});
