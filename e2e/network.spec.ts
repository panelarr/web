// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// Panelarr's network services, end to end against the mock server: a shared proxy and a
// profile using it, chosen for a plugin, and one of its sources opting out.
test("a proxy, a profile from it, chosen for a plugin, and a source going its own way", async ({ page }) => {
  await page.goto("/admin/network?tab=proxies&mock=ready");
  await page.getByRole("button", { name: "Add a proxy" }).click();
  const proxy = page.getByRole("dialog", { name: "Add a proxy" });
  await proxy.getByLabel("ID").fill("office");
  await proxy.getByLabel("Name").fill("Office proxy");
  await proxy.getByLabel("URL", { exact: true }).fill("http://office-proxy:3128");
  await proxy.getByRole("button", { name: "Test" }).click();
  await expect(proxy.getByRole("status")).toContainText("The proxy answered.");
  await proxy.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("li", { hasText: "Office proxy" })).toBeVisible();

  await page.getByRole("tab", { name: "Profiles" }).click();
  await page.getByRole("button", { name: "Add a profile" }).click();
  const profile = page.getByRole("dialog", { name: "Add a profile" });
  await profile.getByLabel("ID").fill("office");
  await profile.getByLabel("Name").fill("Through the office");
  await profile.getByLabel("Proxy").selectOption("office");
  await profile.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("li", { hasText: "Through the office" })).toContainText("via Office proxy");

  await page.goto("/admin/plugins/example?tab=network");
  await page.getByLabel("Network profile for Example Source Plugin").selectOption("profile:office");
  const sources = page.getByRole("region", { name: "Sources" });
  const example = sources.locator("li", { hasText: "Example Source" });
  await expect(example).toContainText("In effect: Through the office (from its plugin).");
  await expect(example.getByText(/On its way|In use/)).toBeVisible();

  const sample = sources.locator("li", { hasText: "Sample Scans" });
  await sample.getByLabel("Network profile for Sample Scans").selectOption("plugin_default");
  await expect(sample).toContainText("Its own settings (chosen on this source).");

  // Admin → Network says where the profile is used.
  await page.goto("/admin/network");
  await expect(page.locator("li", { hasText: "Through the office" })).toContainText("Used for plugin example.");
});
