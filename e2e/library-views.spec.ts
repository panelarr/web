// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator, type Page, test } from "@playwright/test";

// Saved library views on a desktop and a phone: the first view from the remembered setup, the
// heading's list (a menu, or a sheet from the bottom), new views, editing them, and the URL.

/** A fresh install's library with a few works; optionally the sort and display remembered from before views. */
async function fillLibrary(page: Page, remembered?: Record<string, unknown>) {
  // Not the library: it would make the first view before the preference is in place.
  await page.goto("/settings?mock=ready");
  await expect(page.getByRole("heading", { name: "Settings" }).first()).toBeVisible();
  await page.evaluate(async (library) => {
    const send = async (method: string, path: string, body: unknown) => {
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "mock-csrf-token" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
    };
    for (let i = 0; i < 8; i++) await send("POST", "/library", { entry_id: `ent_${1000 + i}` });
    if (library) await send("PUT", "/me/preferences", { version: 1, library });
  }, remembered);
  await page.goto("/");
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
/** The views are loaded (and the first one made): the heading is the views' button. */
const viewsReady = (page: Page) => expect(heading(page).getByRole("button")).toBeVisible();
const works = (page: Page) => page.locator("main a[href^='/works/']").filter({ has: page.locator("p") });

/** The heading's list of views: a menu on desktops, a sheet on phones. */
async function openViews(page: Page, isMobile: boolean): Promise<Locator> {
  await heading(page).getByRole("button").click();
  return isMobile ? page.getByRole("dialog", { name: "Library views" }) : page.getByRole("menu");
}
async function pick(page: Page, isMobile: boolean, name: string | RegExp) {
  const list = await openViews(page, isMobile);
  await list.getByRole(isMobile ? "button" : "menuitem", { name }).click();
}

test("the first view keeps the remembered setup (AC8)", async ({ page }) => {
  await fillLibrary(page, { sort: "title", reverse: true, layout: "list" });
  await expect(heading(page)).toHaveText("Library");
  const list = page.getByRole("list", { name: "Library" });
  await expect(list).toBeVisible();
  const shown = await list.locator("li p").first().textContent();
  const titles = (await list.locator("li").allTextContents()).length;
  expect(titles).toBeGreaterThan(1);
  // Z–A: the first title sorts after the last.
  const last = await list.locator("li p").last().textContent();
  expect((shown ?? "").localeCompare(last ?? "")).toBeGreaterThan(0);
  // One view, saved once, even after a reload.
  await page.reload();
  await viewsReady(page);
  await expect(heading(page)).toHaveText("Library");
  const views = await page.evaluate(async () => (await (await fetch("/api/v1/me/library-views")).json()).views);
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ name: "Library", default: true, definition: { sort: "title", reverse: true } });
});

test("a new view, switched to and back, saved across reloads (AC1, AC2, AC5)", async ({ page, isMobile }) => {
  await fillLibrary(page);
  await expect(page.getByText("8 works")).toBeVisible();

  // New view…: from everything, then set up in the sheet that opens.
  const list = await openViews(page, isMobile);
  await list.getByRole(isMobile ? "button" : "menuitem", { name: "New view…" }).click();
  const dialog = page.getByRole("dialog", { name: "New view" });
  await dialog.getByLabel("Name").fill("Manhwa to start");
  await dialog.getByRole("radio", { name: "Everything" }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/\?view=[0-9a-f-]{36}$/);
  const viewUrl = page.url();
  const sheet = page.getByRole("dialog", { name: "Manhwa to start" });
  // Not started: tap twice (only these, then leave them out).
  const started = sheet.getByRole("checkbox", { name: /^Started/ });
  await started.click();
  await started.click();
  await sheet
    .getByRole("group", { name: "Type" })
    .getByRole("checkbox", { name: /^Manhwa/ })
    .check();
  await sheet.getByRole("tab", { name: "Sort" }).click();
  await sheet.getByRole("button", { name: "Recently updated" }).click();
  await sheet.getByRole("tab", { name: "Display" }).click();
  await sheet.getByRole("radio", { name: "List" }).check();
  await page.keyboard.press("Escape");
  await expect(heading(page)).toHaveText("Manhwa to start");
  await expect(page.getByRole("list", { name: "Library" })).toBeVisible();
  await expect(page.getByText(/^\d+ of 8$/)).toBeVisible();
  const filtered = await works(page).count();
  expect(filtered).toBeLessThan(8);

  // Saved: after a reload, and on "another device" (the API).
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { views } = await (await fetch("/api/v1/me/library-views")).json();
        return views.map((v: { name: string; definition: unknown }) => [v.name, v.definition]);
      }),
    )
    .toEqual([
      ["Library", expect.anything()],
      [
        "Manhwa to start",
        expect.objectContaining({
          filters: { started: "exclude" },
          types: ["manhwa"],
          sort: "updated",
          display: expect.objectContaining({ layout: "list" }),
        }),
      ],
    ]);
  await page.reload();
  await viewsReady(page);
  await expect(heading(page)).toHaveText("Manhwa to start");
  await expect(page.getByRole("list", { name: "Library" })).toBeVisible();

  // Switch at once, without loading the library again; Back returns.
  let libraryLoads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/library") libraryLoads += 1;
  });
  await pick(page, isMobile, /^Library/);
  await expect(heading(page)).toHaveText("Library");
  await expect(page).toHaveURL(/\/\?view=[0-9a-f-]{36}$/);
  expect(page.url()).not.toBe(viewUrl);
  await expect(page.getByText("8 works")).toBeVisible();
  // The Library view was left as it was.
  await expect(page.getByRole("list", { name: "Library" })).toBeHidden();
  await page.goBack();
  await expect(heading(page)).toHaveText("Manhwa to start");
  expect(page.url()).toBe(viewUrl);
  expect(libraryLoads).toBe(0);
});

test("views are renamed, reordered, duplicated, made the default and deleted (AC3, AC4)", async ({
  page,
  isMobile,
}) => {
  await fillLibrary(page);
  await viewsReady(page);
  // Two more, made through the API.
  await page.evaluate(async () => {
    for (const name of ["Second", "Third"]) {
      await fetch("/api/v1/me/library-views", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "mock-csrf-token" },
        body: JSON.stringify({ name, definition: { filters: { started: "include" } } }),
      });
    }
  });
  await page.reload();
  await viewsReady(page);
  const order = async () =>
    page.evaluate(async () =>
      ((await (await fetch("/api/v1/me/library-views")).json()).views as Array<{ name: string; default: boolean }>).map(
        (v) => `${v.name}${v.default ? "*" : ""}`,
      ),
    );
  await expect.poll(order).toEqual(["Library*", "Second", "Third"]);

  const list = await openViews(page, isMobile);
  await list.getByRole(isMobile ? "button" : "menuitem", { name: "Edit views…" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit views" });

  // Rename in place.
  const second = sheet.getByRole("textbox", { name: "Name of Second" });
  await second.fill("Unread manhwa");
  await second.press("Enter");
  await expect.poll(order).toEqual(["Library*", "Unread manhwa", "Third"]);

  // Up and down buttons.
  await sheet.getByRole("button", { name: "Move Third up" }).click();
  await expect.poll(order).toEqual(["Library*", "Third", "Unread manhwa"]);
  await sheet.getByRole("button", { name: "Move Library down" }).click();
  await expect.poll(order).toEqual(["Third", "Library*", "Unread manhwa"]);

  // Drag the handle: Unread manhwa to the top.
  const handle = sheet.getByRole("button", { name: "Drag to move Unread manhwa" });
  const target = sheet.getByRole("button", { name: "Drag to move Third" });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no handles");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(order).toEqual(["Unread manhwa", "Third", "Library*"]);

  // Duplicate.
  await sheet.getByRole("button", { name: "More for Third", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(order).toEqual(["Unread manhwa", "Third", "Library*", "Third copy"]);

  // Make default: the mark moves.
  await sheet.getByRole("button", { name: "More for Third", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make default" }).click();
  await expect.poll(order).toEqual(["Unread manhwa", "Third*", "Library", "Third copy"]);

  // Delete the default, confirmed: the first remaining one takes over.
  await sheet.getByRole("button", { name: "More for Third", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect.poll(order).toEqual(["Unread manhwa*", "Library", "Third copy"]);
  await page.keyboard.press("Escape");

  // / opens the default view.
  await page.goto("/");
  await expect(heading(page)).toHaveText("Unread manhwa");
});

test("an old ?only= link and someone else's view fall back cleanly", async ({ page }) => {
  await fillLibrary(page);
  await expect(heading(page)).toHaveText("Library");
  await page.goto("/?only=started");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("8 works")).toBeVisible();
  await page.goto("/?view=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(/That view isn't one of yours/)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page)).toHaveText("Library");
});

test("on a phone (360 px) the header keeps one row and long names are cut (AC11)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  await fillLibrary(page);
  await viewsReady(page);
  const long = "A very long view name that goes on and on past the edge of a phone";
  await page.evaluate(async (name) => {
    const { views } = await (await fetch("/api/v1/me/library-views")).json();
    await fetch(`/api/v1/me/library-views/${views[0].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "mock-csrf-token" },
      body: JSON.stringify({ name: name.slice(0, 60) }),
    });
  }, long);
  await page.reload();
  const button = heading(page).getByRole("button");
  await expect(button).toContainText("A very long view name");
  const width = page.viewportSize()?.width ?? 0;
  // One row: the heading, the count, the search and the sheet's button share a line.
  const header = page.locator("main header").first();
  const box = await header.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(56);
  const filter = await page.getByRole("button", { name: /^Filter, sort and display/ }).boundingBox();
  const title = await button.boundingBox();
  expect(
    Math.abs((filter?.y ?? 0) + (filter?.height ?? 0) / 2 - ((title?.y ?? 0) + (title?.height ?? 0) / 2)),
  ).toBeLessThan(8);
  // Cut with an ellipsis, nothing scrolls sideways.
  const cut = await button
    .locator("span")
    .first()
    .evaluate((el) => ({
      overflow: getComputedStyle(el).textOverflow,
      clipped: el.scrollWidth > el.clientWidth,
    }));
  expect(cut).toEqual({ overflow: "ellipsis", clipped: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

  // The list opens from the bottom, within reach.
  await button.click();
  const sheet = page.getByRole("dialog", { name: "Library views" });
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(Math.round((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0))).toBeGreaterThanOrEqual(height - 1);
  await expect(sheet.getByRole("button", { name: /A very long view name/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
