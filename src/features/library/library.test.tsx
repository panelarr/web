// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { unifiedChapters } from "@/mocks/chapters";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";

/** Three works; The Lantern Keeper started (its first chapter read). */
function seed() {
  for (const source of db().sources) source.health = { status: "ok" };
  const user = db().users[0];
  if (!user) throw new Error("no user");
  for (const id of ["ent_1000", "ent_1001", "ent_1002"]) addToLibrary(user, id);
  tickMatching(db());
  const lantern = db().works.find((w) => w.title === "The Lantern Keeper");
  const chapters = unifiedChapters(db(), lantern?.id ?? "", user.id).map((c) => c.chapter);
  const first = chapters[0];
  if (first) {
    db().progress[user.id] = {
      [first.id]: { chapter_id: first.id, page: 0, completed: true, updated_at: new Date().toISOString() },
    };
  }
  return { user, lantern, chapters };
}

/** The works in the order shown. */
const titles = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/works/"))
    .map((link) => link.querySelector("p")?.textContent);
const card = (title: string) =>
  (screen
    .getAllByText(title)
    .find((el) => el.closest("a[href^='/works/']"))
    ?.closest("a")?.parentElement ?? document.body) as HTMLElement;

let ctx: ReturnType<typeof seed>;
beforeEach(() => {
  ctx = seed();
});

describe("the library", () => {
  it("shows each work's unread chapters and a button to read on", async () => {
    await renderApp("/");
    expect(await screen.findByText("3 works")).toBeInTheDocument();
    const lantern = card("The Lantern Keeper");
    const unread = ctx.chapters.length - 1;
    expect(within(lantern).getByText(String(unread))).toHaveTextContent(`${unread} unread`);
    expect(within(lantern).getByText(`1 / ${ctx.chapters.length} read`, { exact: false })).toBeInTheDocument();
    // Read on from the second chapter, straight into the reader.
    expect(within(lantern).getByRole("link", { name: "Continue The Lantern Keeper" })).toHaveAttribute(
      "href",
      `/read/${ctx.chapters[1]?.id}`,
    );
    expect(screen.getByRole("link", { name: "Start Iron Garden" })).toBeInTheDocument();
  });

  it("filters to started works, in the URL, and searches", async () => {
    const { router } = await renderApp("/");
    await screen.findByText("3 works");
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Started (1)" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ only: "started" }));
    // The page behind the sheet is hidden while it's open.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()).toEqual(["The Lantern Keeper"]));
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display (1 filters on)" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Started (1)" }));
    await userEvent.keyboard("{Escape}");

    // On a phone the search is an icon in the title row; it opens a field there, ready to type.
    await userEvent.click(screen.getByRole("button", { name: "Search your library" }));
    const field = screen.getByRole("searchbox", { name: "Search your library" });
    expect(field).toHaveFocus();
    // The field takes the title's place (styles aren't applied here: the class says so).
    expect(screen.getByRole("heading", { name: "Library" }).parentElement).toHaveClass("hidden");
    await userEvent.type(field, "moon");
    await waitFor(() => expect(titles()).toEqual(["Moonlit Bakery"]));
    expect(router.state.location.search).toMatchObject({ q: "moon" });
    // ✕ closes it and clears the search.
    await userEvent.click(screen.getByRole("button", { name: "Close the search" }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(screen.getByRole("button", { name: "Search your library" })).toBeInTheDocument();
  });

  it("keeps a search from the URL open", async () => {
    await renderApp("/?q=iron");
    expect(await screen.findByRole("searchbox", { name: "Search your library" })).toHaveValue("iron");
    await waitFor(() => expect(titles()).toEqual(["Iron Garden"]));
  });

  it("sorts, reverses, and remembers it", async () => {
    await renderApp("/");
    await screen.findByText("3 works");
    expect(titles()).toEqual(["Iron Garden", "Moonlit Bakery", "The Lantern Keeper"]);
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Sort" }));
    await userEvent.click(screen.getByRole("button", { name: "Title" }));
    await waitFor(() => expect(db().preferences[ctx.user.id]?.library).toMatchObject({ sort: "title", reverse: true }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()).toEqual(["The Lantern Keeper", "Moonlit Bakery", "Iron Garden"]));
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Sort" }));
    await userEvent.click(screen.getByRole("button", { name: "Recently read" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()[0]).toBe("The Lantern Keeper"));
  });

  it("shows a list or a compact grid, with the badges asked for", async () => {
    const lanternChapter = ctx.chapters[2]?.id;
    if (lanternChapter) db().downloaded.push(lanternChapter);
    await renderApp("/");
    await screen.findByText("3 works");
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Display" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Downloaded chapters" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Unread chapters" }));
    await userEvent.click(screen.getByRole("radio", { name: "List" }));
    await userEvent.keyboard("{Escape}");
    const list = await screen.findByRole("list", { name: "Library" });
    const lantern = within(list).getByText("The Lantern Keeper").closest("li") as HTMLElement;
    expect(within(lantern).getByText("1")).toHaveTextContent("1 downloaded");
    expect(within(lantern).queryByText(/unread/)).not.toBeInTheDocument();
    expect(db().preferences[ctx.user.id]?.library).toMatchObject({
      layout: "list",
      unreadBadges: false,
      downloadBadges: true,
    });
  });
});
