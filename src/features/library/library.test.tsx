// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { components } from "@/api/schema.gen";
import { unifiedChapters } from "@/mocks/chapters";
import { db, type MockLibraryView, newId } from "@/mocks/db";
import { emit } from "@/mocks/events";
import { addToLibrary } from "@/mocks/handlers";
import { mockUrl } from "@/mocks/op";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

type Definition = components["schemas"]["LibraryViewDefinition"];

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

/** Saved views for the user, in this order; the first is the default unless one says so. */
function seedViews(...views: Array<{ name: string; definition?: Definition; default?: boolean }>): MockLibraryView[] {
  const hasDefault = views.some((v) => v.default);
  const made = views.map((v, position) => ({
    user_id: ctx.user.id,
    id: newId(),
    name: v.name,
    position,
    default: hasDefault ? v.default === true : position === 0,
    definition: v.definition ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  db().libraryViews.push(...made);
  return made;
}

const savedView = (name: string) => db().libraryViews.find((v) => v.user_id === ctx.user.id && v.name === name);
const myViews = () =>
  db()
    .libraryViews.filter((v) => v.user_id === ctx.user.id)
    .sort((a, b) => a.position - b.position);

/** The works in the order shown. */
const titles = () =>
  screen
    .queryAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/works/"))
    .map((link) => link.querySelector("p")?.textContent);
const card = (title: string) =>
  (screen
    .getAllByText(title)
    .find((el) => el.closest("a[href^='/works/']"))
    ?.closest("a")?.parentElement ?? document.body) as HTMLElement;

const openSheet = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Filter, sort and display/ }));
  return screen.findByRole("dialog");
};
/** The heading's view list (a sheet on phones, as in these tests). */
const openViews = async (current: string) => {
  await userEvent.click(within(screen.getByRole("heading", { level: 1 })).getByRole("button", { name: current }));
  return screen.findByRole("dialog", { name: "Library views" });
};

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

  it("searches, from the title row", async () => {
    const { router } = await renderApp("/");
    await screen.findByText("3 works");
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

  it("clears the search with its ✕ on a desktop, keeping the field", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...matchMedia(query),
      matches: query === "(min-width: 768px)",
    })) as typeof window.matchMedia;
    try {
      const { router } = await renderApp("/?q=iron");
      const field = await screen.findByRole("searchbox", { name: "Search your library" });
      await waitFor(() => expect(titles()).toEqual(["Iron Garden"]));
      expect(screen.queryByRole("button", { name: "Close the search" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      expect(router.state.location.search).not.toHaveProperty("q");
      expect(field).toHaveFocus();
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});

describe("the first view", () => {
  it("is made from the remembered sort and display, without filters, once (AC8)", async () => {
    const remembered = { sort: "title", reverse: true, layout: "list", unreadBadges: false };
    db().preferences[ctx.user.id] = { version: 1, library: remembered };
    await renderApp("/");
    await waitFor(() => expect(myViews()).toHaveLength(1));
    expect(myViews()[0]).toMatchObject({
      name: "Library",
      default: true,
      definition: {
        sort: "title",
        reverse: true,
        display: { layout: "list", unread_badges: false, download_badges: false, continue_button: true },
      },
    });
    expect(myViews()[0]?.definition.filters).toBeUndefined();
    // It looks as before: the heading, the order and the list.
    expect(screen.getByRole("heading", { name: "Library" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Library" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("p")?.textContent),
    ).toEqual(["The Lantern Keeper", "Moonlit Bakery", "Iron Garden"]);
    // The old preference stays, for an older app.
    expect(db().preferences[ctx.user.id]?.library).toEqual(remembered);
  });

  it("waits for the preferences: none made while they fail, then made from them (AC8)", async () => {
    const remembered = { sort: "unread", reverse: true, layout: "list" };
    db().preferences[ctx.user.id] = { version: 1, library: remembered };
    let failing = true;
    const posts: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/me/library-views")) posts.push(request.url);
    });
    server.use(
      http.get(mockUrl("/me/preferences"), () =>
        failing
          ? HttpResponse.json(
              { type: "about:blank", title: "Unavailable", status: 503, code: "unavailable" },
              { status: 503, headers: { "Content-Type": "application/problem+json" } },
            )
          : undefined,
      ),
    );
    try {
      await renderApp("/");
      // The library shows, with the defaults, and nothing is saved.
      await screen.findByText("3 works");
      expect(titles()).toEqual(["Iron Garden", "Moonlit Bakery", "The Lantern Keeper"]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(myViews()).toHaveLength(0);
      expect(posts).toHaveLength(0);
      // They load on a later try: the view keeps what the user chose.
      failing = false;
      await waitFor(() => expect(myViews()).toHaveLength(1), { timeout: 5000 });
      expect(myViews()[0]?.definition).toMatchObject({ sort: "unread", reverse: true, display: { layout: "list" } });
      expect(posts).toHaveLength(1);
    } finally {
      server.events.removeAllListeners("request:start");
    }
  });

  it("is fetched when another device made it first (AC8)", async () => {
    // This device sees no views; by the time it saves its own, another device has.
    server.use(http.get(mockUrl("/me/library-views"), () => HttpResponse.json({ views: [] }), { once: true }));
    const [other] = seedViews({ name: "Library", definition: { sort: "unread" } });
    await renderApp("/");
    await waitFor(() =>
      expect(within(screen.getByRole("heading", { level: 1 })).getByRole("button", { name: "Library" })).toBeVisible(),
    );
    expect(myViews()).toEqual([other]);
    expect(screen.queryByText(/wasn't saved/)).not.toBeInTheDocument();
  });
});

describe("a view's filters, sort and display", () => {
  it("are changed in the sheet and saved to the view, not others (AC5)", async () => {
    seedViews({ name: "Library" }, { name: "Other", definition: { sort: "total" } });
    const { router } = await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    expect(within(sheet).getByRole("heading", { name: "Library" })).toBeInTheDocument();
    // Started: only these.
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Started (1)" }));
    expect(within(sheet).getByRole("checkbox", { name: "Started (1)" })).toBeChecked();
    await waitFor(() => expect(savedView("Library")?.definition.filters).toEqual({ started: "include" }));
    // Again: leave them out.
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Started (1)" }));
    expect(within(sheet).getByRole("checkbox", { name: "Started (1)" })).toBePartiallyChecked();
    await waitFor(() => expect(savedView("Library")?.definition.filters).toEqual({ started: "exclude" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()).toEqual(["Iron Garden", "Moonlit Bakery"]));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter, sort and display (1 filters on)" })).toBeInTheDocument();
    // Nothing in the URL, and the other view is as it was.
    expect(router.state.location.search).toEqual({});
    expect(savedView("Other")?.definition).toEqual({ sort: "total" });
  });

  it("saves a burst of changes once, after a pause", async () => {
    seedViews({ name: "Library" });
    const patches: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PATCH" && request.url.includes("/me/library-views/")) patches.push(request.url);
    });
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("tab", { name: "Display" }));
    await userEvent.click(within(sheet).getByRole("radio", { name: "List" }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Downloaded chapters" }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Unread chapters" }));
    await waitFor(() =>
      expect(savedView("Library")?.definition.display).toEqual({
        layout: "list",
        unread_badges: false,
        download_badges: true,
        continue_button: true,
      }),
    );
    expect(patches).toHaveLength(1);
    server.events.removeAllListeners("request:start");
  });

  it("sorts, reverses, and shows the badges asked for", async () => {
    seedViews({ name: "Library" });
    const lanternChapter = ctx.chapters[2]?.id;
    if (lanternChapter) db().downloaded.push(lanternChapter);
    await renderApp("/");
    await screen.findByText("3 works");
    expect(titles()).toEqual(["Iron Garden", "Moonlit Bakery", "The Lantern Keeper"]);
    let sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("tab", { name: "Sort" }));
    expect(within(sheet).getByRole("button", { name: "Recently updated" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Title" }));
    await waitFor(() => expect(savedView("Library")?.definition).toMatchObject({ sort: "title", reverse: true }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()).toEqual(["The Lantern Keeper", "Moonlit Bakery", "Iron Garden"]));

    sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("tab", { name: "Display" }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Downloaded chapters" }));
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Unread chapters" }));
    await userEvent.click(within(sheet).getByRole("radio", { name: "List" }));
    await userEvent.keyboard("{Escape}");
    const list = await screen.findByRole("list", { name: "Library" });
    const lantern = within(list).getByText("The Lantern Keeper").closest("li") as HTMLElement;
    expect(within(lantern).getByText("1")).toHaveTextContent("1 downloaded");
    expect(within(lantern).queryByText(/unread/)).not.toBeInTheDocument();
  });

  it("filters by type, status and how recently updated, offering only what's in the library", async () => {
    seedViews({ name: "Library" });
    const types = Object.fromEntries(db().works.map((w) => [w.title, w.type]));
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    const typeGroup = within(sheet).getByRole("group", { name: "Type" });
    const offered = within(typeGroup).getAllByRole("checkbox");
    expect(offered.length).toBe(new Set(Object.values(types)).size);
    const ironType = types["Iron Garden"] ?? "";
    const box = within(typeGroup).getByRole("checkbox", { name: new RegExp(`^${ironType.replace("_", " ")}`, "i") });
    await userEvent.click(box);
    await waitFor(() => expect(savedView("Library")?.definition.types).toEqual([ironType]));
    expect(within(sheet).getByRole("group", { name: "Status" })).toBeInTheDocument();
    // Nothing found a new chapter yet.
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: "Updated within" }), "7");
    await waitFor(() => expect(savedView("Library")?.definition.updated_within_days).toBe(7));
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();
  });

  it("says when a view is empty, and shows everything for now (not saved) or edits it", async () => {
    const definition = { filters: { bookmarked: "include" as const }, sort: "total" as const };
    seedViews({ name: "Bookmarked", definition }, { name: "Other" });
    const patches: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PATCH" && request.url.includes("/me/library-views/")) patches.push(request.url);
    });
    try {
      await renderApp("/");
      expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();
      expect(screen.getByText("0 of 3")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Edit view" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      // Everything, for now; the view keeps its filters.
      await userEvent.click(screen.getByRole("button", { name: "Show everything" }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      expect(screen.getByRole("status")).toHaveTextContent("Showing everything");
      await userEvent.click(screen.getByRole("button", { name: "Back to Bookmarked" }));
      expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();

      // Edit view from there shows the view again, filters and all.
      await userEvent.click(screen.getByRole("button", { name: "Show everything" }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      await userEvent.click(screen.getByRole("button", { name: /^Filter, sort and display/ }));
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).getByRole("checkbox", { name: /^Bookmarked/ })).toBeChecked();
      await userEvent.keyboard("{Escape}");
      expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();

      // Switching views ends it too.
      await userEvent.click(screen.getByRole("button", { name: "Show everything" }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      const list = await openViews("Bookmarked");
      await userEvent.click(within(list).getByRole("button", { name: "Other" }));
      await screen.findByText("3 works");
      const back = await openViews("Other");
      await userEvent.click(within(back).getByRole("button", { name: /^Bookmarked/ }));
      expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();

      expect(patches).toHaveLength(0);
      expect(savedView("Bookmarked")?.definition).toEqual(definition);
    } finally {
      server.events.removeAllListeners("request:start");
    }
  });

  describe("by content rating", () => {
    /** Adds an erotic (Ninth Floor Detectives), an unrated (A Quiet Spell) and a pornographic work (Hollow Crown Academy). */
    const addRated = () => {
      for (const id of ["ent_1005", "ent_1006", "ent_1011"]) addToLibrary(ctx.user, id);
    };
    const ratingGroup = (sheet: HTMLElement) => within(sheet).getByRole("group", { name: "Content rating" });
    /** The checkboxes' labels, in order. */
    const offered = (group: HTMLElement) =>
      within(group)
        .getAllByRole("checkbox")
        .map((box) => document.querySelector(`label[for="${box.id}"]`)?.textContent);

    it("offers every rating in order with counts, hides 18+ from the default view's hint, and keeps only 18+", async () => {
      addRated();
      seedViews({ name: "Library" });
      await renderApp("/");
      await screen.findByText("6 works");
      const sheet = await openSheet();
      const group = ratingGroup(sheet);
      expect(offered(group)).toEqual(["Safe (3)", "Suggestive (0)", "Erotic (1)", "Pornographic (1)", "Unrated (1)"]);
      // The hint, on the default view without a rating filter.
      expect(within(sheet).getByText(/^Tip: hide 18\+ here/)).toBeInTheDocument();
      const hint = within(sheet)
        .getAllByRole("button", { name: "Hide 18+" })
        .find((b) => !group.contains(b));
      if (!hint) throw new Error("no hint");
      await userEvent.click(hint);
      await waitFor(() =>
        expect(savedView("Library")?.definition.content_ratings).toEqual(["safe", "suggestive", "unknown"]),
      );
      expect(within(sheet).queryByText(/^Tip: hide 18\+ here/)).not.toBeInTheDocument();
      expect(within(group).getByRole("button", { name: "Hide 18+" })).toHaveAttribute("aria-pressed", "true");
      expect(within(group).getByRole("checkbox", { name: "Unrated (1)" })).toBeChecked();
      expect(within(group).getByRole("checkbox", { name: "Erotic (1)" })).not.toBeChecked();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(titles()).toEqual(["A Quiet Spell", "Iron Garden", "Moonlit Bakery", "The Lantern Keeper"]),
      );
      expect(screen.getByRole("button", { name: "Filter, sort and display (1 filters on)" })).toBeInTheDocument();

      // Only 18+, then one ticked off by hand.
      const again = ratingGroup(await openSheet());
      await userEvent.click(within(again).getByRole("button", { name: "Only 18+" }));
      await waitFor(() => expect(savedView("Library")?.definition.content_ratings).toEqual(["erotic", "pornographic"]));
      await userEvent.click(within(again).getByRole("checkbox", { name: "Erotic (1)" }));
      await waitFor(() => expect(savedView("Library")?.definition.content_ratings).toEqual(["pornographic"]));
      expect(within(again).getByRole("button", { name: "Only 18+" })).toHaveAttribute("aria-pressed", "false");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(titles()).toEqual(["Hollow Crown Academy"]));
    });

    it("gives no hint on a view that isn't the default", async () => {
      addRated();
      seedViews({ name: "Library" }, { name: "Other" });
      const other = savedView("Other");
      await renderApp(`/?view=${other?.id}`);
      await screen.findByText("6 works");
      const sheet = await openSheet();
      expect(within(ratingGroup(sheet)).getByRole("button", { name: "Hide 18+" })).toBeInTheDocument();
      expect(within(sheet).queryByText(/^Tip:/)).not.toBeInTheDocument();
    });

    it("offers only what the ceiling allows, without the 18+ picks, and a held rating above it to take off", async () => {
      addRated();
      ctx.user.role = "user";
      ctx.user.grants.content_rating_ceiling = "suggestive";
      seedViews({ name: "Library", definition: { content_ratings: ["pornographic", "unknown"] } });
      await renderApp("/");
      await screen.findByText("1 of 4");
      const sheet = await openSheet();
      const group = ratingGroup(sheet);
      expect(offered(group)).toEqual(["Safe (3)", "Suggestive (0)", "Pornographic (0)", "Unrated (1)"]);
      expect(within(group).queryByRole("button")).not.toBeInTheDocument();
      expect(within(sheet).queryByText(/^Tip:/)).not.toBeInTheDocument();
      expect(within(group).queryByText(/18\+/)).not.toBeInTheDocument();
      await userEvent.click(within(group).getByRole("checkbox", { name: "Pornographic (0)" }));
      await waitFor(() => expect(savedView("Library")?.definition.content_ratings).toEqual(["unknown"]));
      expect(within(group).queryByRole("checkbox", { name: /^Pornographic/ })).not.toBeInTheDocument();
    });

    it("are left out by Show everything, and cleared by Reset view", async () => {
      seedViews({ name: "Grown-up", definition: { content_ratings: ["erotic", "pornographic"] } });
      await renderApp("/");
      expect(await screen.findByText("Nothing in this view")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Show everything" }));
      await waitFor(() => expect(titles()).toHaveLength(3));
      expect(savedView("Grown-up")?.definition.content_ratings).toEqual(["erotic", "pornographic"]);
      const sheet = await openSheet();
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset view" }));
      await waitFor(() => expect(savedView("Grown-up")?.definition).not.toHaveProperty("content_ratings"));
    });
  });

  it("is put back to the defaults by Reset view", async () => {
    seedViews({ name: "Library", definition: { filters: { started: "include" }, sort: "unread", reverse: true } });
    await renderApp("/");
    await screen.findByText("1 of 3");
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Reset view" }));
    await waitFor(() =>
      expect(savedView("Library")?.definition).toEqual({
        sort: "title",
        reverse: false,
        display: { layout: "comfortable", unread_badges: true, download_badges: false, continue_button: true },
      }),
    );
    expect(savedView("Library")?.name).toBe("Library");
  });

  it("goes back to what's saved when the server refuses a change", async () => {
    seedViews({ name: "Library" });
    server.use(
      http.patch(mockUrl("/me/library-views/{id}"), () =>
        HttpResponse.json(
          { type: "about:blank", title: "Unavailable", status: 503, code: "unavailable" },
          { status: 503, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Started (1)" }));
    expect(within(sheet).getByRole("checkbox", { name: "Started (1)" })).toBeChecked();
    expect(await screen.findByText(/The view wasn't saved/)).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole("checkbox", { name: "Started (1)" })).not.toBeChecked());
  });

  it("keeps a newer change on screen when an earlier save fails, and saves it", async () => {
    seedViews({ name: "Library" });
    let first = true;
    server.use(
      http.patch(mockUrl("/me/library-views/{id}"), async () => {
        if (!first) return undefined;
        first = false;
        // Slow enough for the next change to come in while it's on its way.
        await new Promise((resolve) => setTimeout(resolve, 300));
        return HttpResponse.json(
          { type: "about:blank", title: "Unavailable", status: 503, code: "unavailable" },
          { status: 503, headers: { "Content-Type": "application/problem+json" } },
        );
      }),
    );
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Started (1)" }));
    // The first save is on its way (after the pause): change something else.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.click(within(sheet).getByRole("tab", { name: "Display" }));
    await userEvent.click(within(sheet).getByRole("radio", { name: "List" }));
    expect(await screen.findByText(/The view wasn't saved/)).toBeInTheDocument();
    // Still shown, then saved with both changes.
    expect(within(sheet).getByRole("radio", { name: "List" })).toBeChecked();
    await waitFor(() =>
      expect(savedView("Library")?.definition).toMatchObject({
        filters: { started: "include" },
        display: { layout: "list" },
      }),
    );
    expect(within(sheet).getByRole("radio", { name: "List" })).toBeChecked();
  });

  it("saves the last change when the page is left before the pause ends", async () => {
    seedViews({ name: "Library" });
    const { router } = await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Started (1)" }));
    await router.navigate({ to: "/browse" });
    await waitFor(() => expect(savedView("Library")?.definition.filters).toEqual({ started: "include" }));
  });
});

describe("switching views", () => {
  it("shows the default view on /, another by its ID, and Back returns (AC2, AC3)", async () => {
    const [, started] = seedViews(
      { name: "Library" },
      { name: "Started, by unread", definition: { filters: { started: "include" }, display: { layout: "list" } } },
    );
    const { router } = await renderApp("/");
    await screen.findByText("3 works");
    const list = await openViews("Library");
    const items = within(list)
      .getAllByRole("button")
      .filter((b) => b.textContent !== "Close");
    expect(items.map((b) => b.textContent)).toEqual([
      "LibraryDefault",
      "Started, by unread",
      "New view…",
      "Edit views…",
    ]);
    expect(within(list).getByRole("button", { name: /^Library/ })).toHaveAttribute("aria-current", "true");
    await userEvent.click(within(list).getByRole("button", { name: "Started, by unread" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: started?.id }));
    expect(await screen.findByRole("list", { name: "Library" })).toBeInTheDocument();
    expect(titles()).toEqual(["The Lantern Keeper"]);
    expect(within(screen.getByRole("heading", { level: 1 })).getByRole("button")).toHaveTextContent(
      "Started, by unread",
    );
    // Back: the view before.
    router.history.back();
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(router.state.location.search).toEqual({});
  });

  it("follows changes made on another device", async () => {
    const [library] = seedViews({ name: "Library" });
    await renderApp("/");
    await screen.findByText("3 works");
    if (library) {
      library.name = "Renamed elsewhere";
      library.definition = { filters: { started: "include" } };
    }
    emit("library_views.changed", { view_id: library?.id ?? "" });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Renamed elsewhere" })).toBeInTheDocument());
    expect(titles()).toEqual(["The Lantern Keeper"]);
  });

  it("opens the default view on /", async () => {
    seedViews({ name: "All" }, { name: "Started", definition: { filters: { started: "include" } }, default: true });
    await renderApp("/");
    await waitFor(() => expect(titles()).toEqual(["The Lantern Keeper"]));
    expect(screen.getByRole("heading", { name: "Started" })).toBeInTheDocument();
  });

  it("shows the default view, saying so, for a view that isn't the user's (AC9)", async () => {
    seedViews({ name: "Library" });
    const theirs = db().users[1];
    if (!theirs) throw new Error("no second user");
    db().libraryViews.push({
      user_id: theirs.id,
      id: newId(),
      name: "Theirs",
      position: 0,
      default: true,
      definition: { filters: { started: "include" } },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const id = db().libraryViews.at(-1)?.id;
    const { router } = await renderApp(`/?view=${id}`);
    expect(await screen.findByText(/That view isn't one of yours/)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(titles()).toHaveLength(3);
  });

  it("drops the old ?only= filters from the URL, replacing it", async () => {
    seedViews({ name: "Library" });
    const { router } = await renderApp("/?only=started&q=garden");
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "garden" }));
    expect(router.history.length).toBe(1);
    await waitFor(() => expect(titles()).toEqual(["Iron Garden"]));
  });
});

describe("new views", () => {
  it("are made from this view or everything, then shown with the sheet open (AC1)", async () => {
    seedViews({ name: "Library", definition: { filters: { started: "include" } } });
    const { router } = await renderApp("/");
    await screen.findByText("1 of 3");
    let list = await openViews("Library");
    await userEvent.click(within(list).getByRole("button", { name: "New view…" }));
    let dialog = await screen.findByRole("dialog", { name: "New view" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Everything");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Everything" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: savedView("Everything")?.id }));
    expect(savedView("Everything")?.definition.filters).toBeUndefined();
    // The sheet opens on it, to set it up.
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Everything" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(titles()).toHaveLength(3));

    // A name taken (ignoring case) is said in the dialog.
    list = await openViews("Everything");
    await userEvent.click(within(list).getByRole("button", { name: "New view…" }));
    dialog = await screen.findByRole("dialog", { name: "New view" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "library");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText("You have a view with this name.")).toBeInTheDocument();
    // From this view: its filters come along.
    await userEvent.clear(within(dialog).getByLabelText("Name"));
    await userEvent.type(within(dialog).getByLabelText("Name"), "Copy of everything");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(savedView("Copy of everything")).toBeDefined());
    expect(myViews().map((v) => v.name)).toEqual(["Library", "Everything", "Copy of everything"]);
  });
});

describe("editing views", () => {
  const manage = async (current: string) => {
    const list = await openViews(current);
    await userEvent.click(within(list).getByRole("button", { name: "Edit views…" }));
    return screen.findByRole("dialog", { name: "Edit views" });
  };

  it("renames, reorders, duplicates, makes the default and deletes (AC4)", async () => {
    seedViews({ name: "Library" }, { name: "Second" }, { name: "Third" });
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await manage("Library");

    // Rename in place.
    const name = within(sheet).getByRole("textbox", { name: "Name of Second" });
    await userEvent.clear(name);
    await userEvent.type(name, "Unread manhwa{Enter}");
    await waitFor(() => expect(savedView("Unread manhwa")).toBeDefined());
    // A taken name is refused and put back.
    const third = within(sheet).getByRole("textbox", { name: "Name of Third" });
    await userEvent.clear(third);
    await userEvent.type(third, "LIBRARY{Enter}");
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("You have a view named “LIBRARY”.");
    expect(third).toHaveValue("Third");

    // Up and down.
    await userEvent.click(within(sheet).getByRole("button", { name: "Move Third up" }));
    await waitFor(() => expect(myViews().map((v) => v.name)).toEqual(["Library", "Third", "Unread manhwa"]));
    expect(within(sheet).getByRole("button", { name: "Move Library up" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Move Library down" }));
    await waitFor(() => expect(myViews().map((v) => v.name)).toEqual(["Third", "Library", "Unread manhwa"]));

    // Duplicate.
    await userEvent.click(within(sheet).getByRole("button", { name: "More for Unread manhwa" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(savedView("Unread manhwa copy")).toBeDefined());

    // Make default: the mark moves, there's always one.
    await userEvent.click(within(sheet).getByRole("button", { name: "More for Third" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Make default" }));
    await waitFor(() => expect(savedView("Third")?.default).toBe(true));
    expect(myViews().filter((v) => v.default)).toHaveLength(1);

    // Delete the default, confirmed: the first remaining becomes the default.
    await userEvent.click(within(sheet).getByRole("button", { name: "More for Third" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Your first remaining view becomes the default.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(savedView("Third")).toBeUndefined());
    expect(myViews().map((v) => [v.name, v.default])).toEqual([
      ["Library", true],
      ["Unread manhwa", false],
      ["Unread manhwa copy", false],
    ]);
  });

  it("puts a name back on Escape, keeping the sheet open; the next Escape closes it", async () => {
    seedViews({ name: "Library" }, { name: "Second" });
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await manage("Library");
    const name = within(sheet).getByRole("textbox", { name: "Name of Second" });
    await userEvent.clear(name);
    await userEvent.type(name, "Half typed");
    await userEvent.keyboard("{Escape}");
    expect(name).toHaveValue("Second");
    expect(screen.getByRole("dialog", { name: "Edit views" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit views" })).not.toBeInTheDocument());
    expect(savedView("Second")).toBeDefined();
  });

  it("can't delete the only view", async () => {
    seedViews({ name: "Library" });
    await renderApp("/");
    await screen.findByText("3 works");
    const sheet = await manage("Library");
    expect(within(sheet).getByText("Your only view can't be deleted.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "More for Library" }));
    expect(await screen.findByRole("menuitem", { name: "Delete…" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Make default" })).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves a view that was deleted for the default, quietly", async () => {
    const [, other] = seedViews(
      { name: "Library" },
      { name: "Other", definition: { filters: { started: "include" } } },
    );
    const { router } = await renderApp(`/?view=${other?.id}`);
    await waitFor(() => expect(titles()).toEqual(["The Lantern Keeper"]));
    const sheet = await manage("Other");
    await userEvent.click(within(sheet).getByRole("button", { name: "More for Other" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByText(/That view isn't one of yours/)).not.toBeInTheDocument();
  });
});
