// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

// The production build, served with the server's security headers (csp.config.mjs), with the
// API answered by the test. It must work without breaking the CSP anywhere: pages, dialogs
// (which lock scrolling with inserted styles), toasts and the saved theme.
test("runs under the server's Content-Security-Policy", async ({ page, baseURL }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));
  await fakeApi(page, baseURL ?? "http://localhost");

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  await page.goto("/settings?tab=api-keys");
  await page.getByRole("button", { name: "New key" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.getByRole("tab", { name: "Appearance" }).click();
  await page.getByText("True black").click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  expect(violations).toEqual([]);
});
