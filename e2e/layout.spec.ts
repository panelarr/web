// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";

/** Fields side by side (same parent, same row) whose labels or controls don't share a top edge. */
async function misalignedFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const rows = new Map<string, Element[]>();
    for (const field of document.querySelectorAll("[data-slot=field]")) {
      const rect = field.getBoundingClientRect();
      if (rect.width === 0 || !field.parentElement) continue;
      const key = `${[...document.querySelectorAll("*")].indexOf(field.parentElement)}:${Math.round(rect.top)}`;
      rows.set(key, [...(rows.get(key) ?? []), field]);
    }
    for (const fields of rows.values()) {
      if (fields.length < 2) continue;
      const tops = fields.map((field) => {
        const label = field.querySelector("label");
        const control = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
        return {
          name: label?.textContent ?? "?",
          label: label?.getBoundingClientRect().top ?? 0,
          control: control?.getBoundingClientRect().top ?? 0,
          height: control?.getBoundingClientRect().height ?? 0,
        };
      });
      const [first, ...rest] = tops;
      for (const other of rest) {
        if (!first) continue;
        for (const part of ["label", "control", "height"] as const) {
          if (Math.abs(first[part] - other[part]) > 1) {
            out.push(`${first.name} / ${other.name}: ${part} ${first[part].toFixed(1)} vs ${other[part].toFixed(1)}`);
          }
        }
      }
    }
    return out;
  });
}

/**
 * Anything that scrolls sideways (tab strips) but would also scroll up and down: with scrollbars
 * always shown (a setting on macOS, the default on Windows and Linux) that's a stray vertical
 * scrollbar. `overflow-x: auto` alone makes `overflow-y` auto too.
 */
async function strayScrollbars(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    // Only what is meant to scroll sideways: dialogs and lists may scroll up and down.
    [...document.querySelectorAll('[data-slot="scroll-strip"], [class*="overflow-x-auto"]')]
      .filter((element) => {
        const vertical = getComputedStyle(element).overflowY;
        return (vertical === "auto" || vertical === "scroll") && element.scrollHeight > element.clientHeight;
      })
      .map((element) => `${element.textContent?.slice(0, 40)}: ${element.scrollHeight} > ${element.clientHeight}`),
  );
}

async function check(page: Page, where: string, found: string[]) {
  await page.waitForTimeout(250);
  for (const problem of await misalignedFields(page)) found.push(`${where}: ${problem}`);
  for (const problem of await strayScrollbars(page)) found.push(`${where}: also scrolls vertically: ${problem}`);
}

test("fields side by side line up, and tab strips only scroll sideways", async ({ page }) => {
  test.setTimeout(90_000);
  const found: string[] = [];
  const dialog = () => page.getByRole("dialog");
  const open = async (path: string) => {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
  };

  await open("/admin/storage?mock=ready");
  await check(page, "storage", found);
  await page.getByRole("button", { name: "Add storage" }).click();
  await check(page, "add storage (local)", found);
  await dialog().getByLabel("Kind").selectOption("s3");
  await check(page, "add storage (S3)", found);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit" }).last().click();
  await check(page, "edit storage (S3)", found);
  await page.keyboard.press("Escape");

  await open("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();
  await check(page, "add user", found);
  await dialog().getByRole("button", { name: "Add user" }).click(); // the browser marks the missing fields
  await check(page, "add user (empty)", found);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Invite" }).click();
  await check(page, "invite", found);
  await page.keyboard.press("Escape");
  await open("/admin/users/7c9d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f");
  await check(page, "user", found);

  await open("/admin/plugins");
  await page.getByRole("button", { name: "Add plugin" }).click();
  await check(page, "add plugin", found);
  await page.keyboard.press("Escape");
  await open("/admin/plugins/example");
  await check(page, "plugin settings", found);
  for (const plugin of ["example", "stores"]) {
    await open(`/admin/plugins/${plugin}?tab=network`);
    await check(page, `${plugin} network`, found);
  }
  for (const tab of ["profiles", "proxies", "solvers"]) {
    await open(`/admin/network?tab=${tab}`);
    await check(page, `network ${tab}`, found);
  }
  await open("/admin/network");
  await page.getByRole("button", { name: "Add a profile" }).click();
  await expect(dialog().getByLabel("Proxy")).toBeVisible();
  await check(page, "a new profile", found);
  await page.keyboard.press("Escape");
  await open("/admin/network?tab=proxies");
  await page.getByRole("button", { name: "Add a proxy" }).click();
  await check(page, "a new proxy", found);
  await page.keyboard.press("Escape");
  await open("/admin/sources");
  await page.getByRole("button", { name: "Settings for Example Source" }).click();
  await expect(dialog().getByLabel("Image quality")).toBeVisible();
  await check(page, "a source's settings", found);
  await page.keyboard.press("Escape");
  await open("/admin/plugins/stores?tab=extensions");
  await check(page, "extensions", found);
  await open("/admin/plugins/stores?tab=extensions&pkg=org.example.polyglot");
  await expect(dialog()).toBeVisible();
  await check(page, "an extension's details", found);
  await page.keyboard.press("Escape");

  for (const path of [
    "/admin/sources",
    "/admin/sources/example:1001",
    "/admin/sources/example:1001?list=search&q=the",
    "/admin/sources/example:1001/series?key=%2Fseries%2F1000",
    "/admin/jobs",
    "/admin/jobs/update-check",
    "/admin/queue",
    "/admin/system",
    "/admin/metadata",
    "/admin/metadata?tab=jobs",
    "/admin/metadata?tab=jobs&job=sync.example-provider.dump",
    "/admin/metadata?tab=network",
    "/admin/metadata?tab=providers",
    "/admin/metadata?tab=providers&provider=example-provider",
    "/admin/metadata?tab=providers&provider=example-provider&sync=sr-102",
    "/admin/plugins/stores?tab=jobs",
    "/admin/plugins/stores?tab=sources",
    "/admin/plugins/stores?tab=jobs&job=source-health",
    "/admin/metadata?tab=duplicates",
    "/admin/metadata?tab=duplicates&pair=1",
  ]) {
    await open(path);
    await check(page, path, found);
  }
  await open("/admin/metadata?tab=duplicates");
  await page.getByRole("button", { name: "Settings" }).click();
  await check(page, "decision model", found);
  await page.keyboard.press("Escape");
  await open("/admin/metadata?tab=duplicates&pair=1");
  await page.getByRole("button", { name: "Merge" }).click();
  await check(page, "merge a pair", found);
  await page.keyboard.press("Escape");
  await open("/admin/jobs");
  await page
    .locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Clean up" }) })
    .getByRole("button", { name: "Run now" })
    .click();
  await check(page, "run job", found);
  await page.keyboard.press("Escape");

  for (const tab of ["profile", "security", "api-keys", "appearance"]) {
    await open(`/settings?tab=${tab}`);
    await check(page, `settings ${tab}`, found);
  }
  await page.goto("/settings?tab=api-keys");
  await page.getByRole("button", { name: "New key" }).click();
  await check(page, "new API key", found);
  await page.keyboard.press("Escape");

  await open("/browse");
  await check(page, "browse", found);

  await open("/?mock=fresh");
  await check(page, "setup: admin", found);

  expect(found).toEqual([]);
});
