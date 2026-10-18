// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";
import { groupUpdates, type UpdateItem } from "./updates";

function seed() {
  const user = db().users[0];
  if (!user) throw new Error("no user");
  for (const source of db().sources) source.health = { status: "ok" };
  addToLibrary(user, "ent_1001");
  tickMatching(db());
  const work = db().works.find((w) => w.entry_id === "ent_1001");
  if (!work) throw new Error("no work");
  return { user, work };
}

let ctx: ReturnType<typeof seed>;
beforeEach(() => {
  ctx = seed();
});

describe("updates", () => {
  it("lists new chapters by day, a row per series, with more to show", async () => {
    await renderApp("/updates");
    const today = await screen.findByRole("region", { name: "Today" });
    const row = within(today).getByText(ctx.work.title).closest("li") as HTMLElement;
    expect(
      within(row).getByRole("link", { name: new RegExp(`^${ctx.work.title}: Vol\\. 2 · Chapter 15`) }),
    ).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Show 1 more chapter" }));
    expect(within(row).getByRole("list", { name: `More new chapters of ${ctx.work.title}` })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getByText(/Last update: /)).toBeInTheDocument();
  });

  it("marks a row's chapters read and dims them", async () => {
    await renderApp("/updates");
    const today = await screen.findByRole("region", { name: "Today" });
    await userEvent.click(within(today).getByRole("button", { name: `More for ${ctx.work.title}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark these as read" }));
    await waitFor(() =>
      expect(Object.values(db().progress[ctx.user.id] ?? {}).filter((p) => p.completed)).toHaveLength(2),
    );
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Today" })).getAllByRole("link")[0]).toHaveClass("opacity-60"),
    );
  });

  it("downloads a row's chapters", async () => {
    await renderApp("/updates");
    const today = await screen.findByRole("region", { name: "Today" });
    await userEvent.click(within(today).getByRole("button", { name: `Download ${ctx.work.title}: 2 chapters` }));
    expect(await screen.findByText("2 queued.")).toBeInTheDocument();
  });

  it("checks for new chapters on request and follows the check to its end", async () => {
    db().updates.last_checked_at = new Date(Date.now() - 5 * 3_600_000).toISOString();
    await renderApp("/updates");
    expect(await screen.findByText(/Last update: 5 hours ago/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check for new chapters" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Last update: now|seconds? ago/), {
      timeout: 8_000,
    });
  });

  it("is a main tab, after the library", async () => {
    await renderApp("/");
    const nav = (await screen.findAllByRole("navigation", { name: "Main" })).at(-1) as HTMLElement;
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Library", "Updates", "History", "Browse", "More"]);
  });
});

describe("grouping updates", () => {
  it("makes one row per series per day, in the feed's order", () => {
    const now = new Date("2026-10-18T15:00:00");
    const item = (work: string, at: string, id: string) =>
      ({ work_id: work, work_title: work, appeared_at: at, chapter_id: id }) as UpdateItem;
    const days = groupUpdates(
      [
        item("a", "2026-10-18T12:00:00", "a2"),
        item("b", "2026-10-18T11:00:00", "b1"),
        item("a", "2026-10-18T10:00:00", "a1"),
        item("a", "2026-10-17T10:00:00", "a0"),
      ],
      now,
    );
    expect(days.map(([day, rows]) => [day, rows.map((r) => `${r.workId}:${r.chapters.length}`)])).toEqual([
      ["Today", ["a:2", "b:1"]],
      ["Yesterday", ["a:1"]],
    ]);
  });
});
