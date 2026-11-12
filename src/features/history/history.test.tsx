// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unifiedChapters } from "@/mocks/chapters";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";
import { byDay, chapterText, dayLabel, type HistoryItem, pageText } from "./history";

/** Midnight at the start of today, local time. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Noon yesterday (local), whatever the time of day now. */
const yesterday = () => new Date(startOfToday() - 12 * 3_600_000).toISOString();
/**
 * Some minutes ago, but never before today started: just after midnight the reads stay on today, `offset` ms after
 * midnight, so their order holds too.
 */
const todayAgo = (minutes: number, offset: number) =>
  new Date(Math.max(Date.now() - minutes * 60_000, startOfToday() + offset)).toISOString();

function seed() {
  const user = db().users[0];
  if (!user) throw new Error("no user");
  for (const source of db().sources) source.health = { status: "ok" };
  const works = ["ent_1000", "ent_1001"].map((entryId) => {
    addToLibrary(user, entryId);
    tickMatching(db());
    const work = db().works.find((w) => w.entry_id === entryId);
    if (!work) throw new Error(`no work for ${entryId}`);
    return { work, chapters: unifiedChapters(db(), work.id, user.id).map((c) => c.chapter) };
  });
  const [manga, manhwa] = works as [(typeof works)[0], (typeof works)[0]];
  const read = (chapterId: string, page: number, completed: boolean, at: string) => {
    db().progress[user.id] ??= {};
    (db().progress[user.id] as Record<string, unknown>)[chapterId] = {
      chapter_id: chapterId,
      page,
      pages: 22,
      completed,
      updated_at: at,
    };
  };
  // Yesterday: the manga's first chapter, read to the end; today: two chapters of the manhwa.
  read(manga.chapters[0]?.id ?? "", 21, true, yesterday());
  read(manhwa.chapters[0]?.id ?? "", 21, true, todayAgo(30, 0));
  read(manhwa.chapters[1]?.id ?? "", 12, false, todayAgo(12, 1));
  return { user, manga, manhwa };
}

let ctx: ReturnType<typeof seed>;

const rows = () => screen.getAllByRole("link", { name: /^Resume / });

async function expectByDay() {
  await renderApp("/history");
  const today = await screen.findByRole("region", { name: "Today" });
  expect(within(today).getByText(ctx.manhwa.work.title)).toBeInTheDocument();
  expect(within(today).getByText(/· Page 13\/22 · /)).toBeInTheDocument();
  const yesterday = screen.getByRole("region", { name: "Yesterday" });
  expect(within(yesterday).getByText(ctx.manga.work.title)).toBeInTheDocument();
  expect(within(today).getByRole("link", { name: `Resume ${ctx.manhwa.work.title}` })).toHaveAttribute(
    "href",
    `/read/${ctx.manhwa.chapters[1]?.id}`,
  );
}

describe("history", () => {
  beforeEach(() => {
    ctx = seed();
  });

  it("shows one line per series by day, newest first, resuming where the series is at", expectByDay);

  it("shows every chapter read when asked, and searches", async () => {
    const { router } = await renderApp("/history");
    await screen.findByRole("region", { name: "Today" });
    await userEvent.click(screen.getByRole("button", { name: "History menu" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Every chapter read" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(router.state.location.search).toMatchObject({ every: true });

    await userEvent.click(screen.getByRole("button", { name: "Search your history" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search your history" }), ctx.manga.work.title);
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("takes a series out after asking, keeping its read marks", async () => {
    await renderApp("/history");
    await screen.findByRole("region", { name: "Today" });
    await userEvent.click(screen.getByRole("button", { name: `More for ${ctx.manhwa.work.title}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove from history…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByText(`${ctx.manhwa.work.title} left your history. Read marks stay.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Today" })).not.toBeInTheDocument());
    expect(db().progress[ctx.user.id]?.[ctx.manhwa.chapters[0]?.id ?? ""]?.completed).toBe(true);
  });

  it("clears everything after asking", async () => {
    await renderApp("/history");
    await screen.findByRole("region", { name: "Today" });
    await userEvent.click(screen.getByRole("button", { name: "History menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Clear history…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    expect(await screen.findByText("Nothing read yet")).toBeInTheDocument();
  });

  it("is a main tab", async () => {
    await renderApp("/");
    // The sidebar (desktop) and the bottom bar (phones) both have it.
    const navs = await screen.findAllByRole("navigation", { name: "Main" });
    for (const nav of navs) expect(within(nav).getByRole("link", { name: "History" })).toBeInTheDocument();
  });
});

// The days are local: the grouping must hold just after midnight, early in the morning and late at night.
describe.each(["00:10", "04:00", "23:50"])("history at %s", (clock) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`2026-10-18T${clock}:00`));
    ctx = seed();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still groups today's and yesterday's reads by day", expectByDay);
});

describe("history's labels", () => {
  const now = new Date("2026-10-18T15:00:00");
  it("name the day", () => {
    expect(dayLabel("2026-10-18T09:00:00", now)).toBe("Today");
    expect(dayLabel("2026-10-17T23:30:00", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-12T10:00:00", now)).not.toMatch(/Today|Yesterday/);
  });

  it("group runs of the same day", () => {
    const item = (at: string) => ({ updated_at: at }) as HistoryItem;
    expect(
      byDay([item("2026-10-18T10:00:00"), item("2026-10-18T08:00:00"), item("2026-10-17T20:00:00")], now).map(
        ([day, items]) => [day, items.length],
      ),
    ).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
    ]);
  });

  it("say the chapter, and where reading stopped until it's read", () => {
    const base = { chapter_number: 200, chapter_volume: "3", chapter_title: "", chapter_display_title: "", page: 12 };
    expect(chapterText({ ...base, pages: 117, completed: false } as HistoryItem)).toBe("Vol. 3 · Chapter 200");
    expect(pageText({ ...base, pages: 117, completed: false } as HistoryItem)).toBe("Page 13/117");
    expect(pageText({ ...base, pages: 117, completed: true } as HistoryItem)).toBeUndefined();
  });
});
