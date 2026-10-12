// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The rest of a source plugin's own admin, from its page in Panelarr's: its stores, an
// installed extension, and its sources' health checks.
test("a store refreshed, an extension reloaded, a source checked now", async ({ page }) => {
  await page.goto("/admin/plugins/stores?tab=extensions&mock=ready");
  const mirror = page.getByRole("region", { name: "Stores" }).locator("li", { hasText: "Mirror store" });
  await expect(mirror).toContainText("Last refresh failed");
  await mirror.getByRole("button", { name: "Refresh Mirror store now" }).click();
  await expect(mirror).not.toContainText("Last refresh failed");

  await page.goto("/admin/plugins/stores?tab=extensions&pkg=org.example.polyglot");
  const installed = page.getByRole("dialog").getByRole("region", { name: "Installed" });
  await installed.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("Polyglot Comics reloaded.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/admin/plugins/stores?tab=sources");
  const ja = page.locator("li", {
    has: page.getByRole("switch", { name: "Scheduled checks for Polyglot Comics (ja)" }),
  });
  await expect(ja).toContainText("Failing");
  await ja.getByRole("button", { name: "Check Polyglot Comics (ja) now" }).click();
  await expect(ja).toContainText("Checking…");
  await expect(ja).toContainText("Healthy", { timeout: 20_000 });
});
