// SPDX-License-Identifier: GPL-3.0-or-later

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility checks (axe) on the main pages: serious and critical problems fail.
// They don't replace trying the app with a keyboard and a screen reader.
const PAGES = [
  "/login?mock=signed-out",
  "/?mock=fresh",
  "/?mock=ready",
  "/browse",
  "/catalog/ent_1001",
  "/browse/sources/example:1001",
  "/downloads",
  "/settings?tab=appearance",
  "/settings?tab=api-keys",
  "/admin/users",
  "/admin/plugins/example",
  "/admin/sources",
  "/admin/jobs",
  "/admin/queue",
  "/admin/storage",
];

test("the main pages have no serious accessibility problems", async ({ page, isMobile }) => {
  test.skip(isMobile, "the same markup on both; desktop is enough");
  test.setTimeout(90_000);
  const found: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of serious) {
      const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(" "));
      found.push(`${path}: ${v.id} (${v.impact}): ${v.help} → ${nodes.join(", ")}`);
    }
  }
  expect(found).toEqual([]);
});

test("the dark theme keeps text readable", async ({ page, isMobile }) => {
  test.skip(isMobile, "the same markup on both; desktop is enough");
  await page.goto("/?mock=ready");
  await page.evaluate(() =>
    localStorage.setItem("panelarr.theme.prefs", JSON.stringify({ theme: "dark", accent: "#E0457B", font: "inter" })),
  );
  const found: string[] = [];
  for (const path of ["/", "/settings?tab=appearance", "/admin/jobs", "/catalog/ent_1001"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    found.push(...results.violations.flatMap((v) => v.nodes.slice(0, 3).map((n) => `${path}: ${n.target.join(" ")}`)));
  }
  expect(found).toEqual([]);
});
