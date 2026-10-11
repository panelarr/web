// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

// The production build, served with the server's security headers (csp.config.mjs). There
// is no API behind it, so data requests fail; the app must still render without breaking
// the CSP anywhere.
test("runs under the server's Content-Security-Policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  await page.goto("/settings");
  await page.getByText("True black").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  expect(violations).toEqual([]);
});
