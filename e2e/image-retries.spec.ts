// SPDX-License-Identifier: GPL-3.0-or-later

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// How failed page images are tried again: set on an extension for all its sources, overridden
// on one of them, and back to inheriting.
test("image retries on an extension, a source's own, and back", async ({ page, isMobile }) => {
  await page.goto("/admin/plugins/stores?tab=extensions&pkg=org.example.polyglot&mock=ready");
  const sheet = page.getByRole("dialog");
  const extension = sheet.getByRole("region", { name: "Image retries" });
  await expect(extension).toContainText("In effect: 2 more attempts, after 1 s then 3 s (the default).");

  await extension.getByLabel("Image retries for this extension").selectOption("custom");
  await extension.getByRole("button", { name: "Add attempt" }).click();
  await extension.getByRole("spinbutton", { name: "Wait before attempt 4, in seconds" }).fill("10");
  if (!isMobile) {
    const results = await new AxeBuilder({ page })
      .include("[role=dialog]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  }
  await extension.getByRole("button", { name: "Save" }).click();
  await expect(extension).toContainText("In effect: 3 more attempts, after 1 s, 3 s then 10 s (set here).");

  // One of its sources: inherits it, then turns retries off for itself.
  await sheet.getByRole("button", { name: "Settings for Polyglot Comics" }).first().click();
  const source = page.getByLabel("Image retries for this source").locator("xpath=ancestor::section[1]");
  await expect(source).toContainText("In effect: 3 more attempts, after 1 s, 3 s then 10 s (from its extension).");
  await source.getByLabel("Image retries for this source").selectOption("off");
  await expect(source).toContainText("In effect: no more attempts (set here).");
  await source.getByLabel("Image retries for this source").selectOption("inherit");
  await expect(source).toContainText("(from its extension).");
  await page.keyboard.press("Escape");

  // The extension back to the default.
  await extension.getByLabel("Image retries for this extension").selectOption("inherit");
  await expect(extension).toContainText("In effect: 2 more attempts, after 1 s then 3 s (the default).");
});
