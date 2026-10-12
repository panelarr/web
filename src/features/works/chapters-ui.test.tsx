// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";

/** A work attached on both sources, so most chapters have two copies. */
function seedWork() {
  for (const source of db().sources) source.health = { status: "ok" };
  const user = db().users[0];
  if (!user) throw new Error("no user");
  addToLibrary(user, "ent_1000");
  tickMatching(db());
  const work = db().works[0];
  const row = db().matching[work?.id ?? ""]?.find((r) => r.source.id === "example:1002");
  const candidate = row?.candidates.find((c) => c.key === "/series/1000");
  if (row && candidate) {
    row.attached = { ...candidate, state: "attached" };
    row.candidates = [];
    row.status = "matched";
  }
  return work?.id ?? "";
}

const chapterRow = (label: string) => screen.getByRole("link", { name: label }).closest("li") as HTMLElement;

let workId = "";
beforeEach(() => {
  workId = seedWork();
});

describe("a work's chapters", () => {
  it("lists the newest first by default, and remembers the order chosen", async () => {
    const { router } = await renderApp(`/works/${workId}`);
    await screen.findByText(/^15 chapters/);
    const labels = () =>
      within(screen.getByRole("list", { name: "Chapters" }))
        .getAllByRole("link", { name: /Chapter/ })
        .map((link) => link.getAttribute("aria-label") ?? link.textContent);
    await waitFor(() => expect(labels()[0]).toMatch(/Chapter 1[0-9]/));
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Sort" }));
    await userEvent.click(screen.getByRole("radio", { name: "Oldest first" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ order: "asc" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(labels()[0]).toMatch(/Chapter 1\b/));
    await waitFor(() =>
      expect((db().preferences[db().currentUserId ?? ""] as { chapters?: unknown }).chapters).toEqual({
        order: "asc",
        sort: "number",
        display: "title",
      }),
    );
    // Another work (or a later visit) opens in the order remembered.
    await router.navigate({ to: "/works/$workId", params: { workId } });
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await waitFor(() => expect(labels()[0]).toMatch(/Chapter 1\b/));
  });

  it("unifies the sources' chapters, one row each, with the chosen copy and why", async () => {
    await renderApp(`/works/${workId}`);
    expect(await screen.findByText(/^15 chapters · 15 unread$/)).toBeInTheDocument();
    // Plain rows: no "New" badges.
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    const one = chapterRow("Vol. 1 · Chapter 1");
    expect(within(one).getByText(/Example Source · Official · EN · .* · first source/)).toBeInTheDocument();
    expect(within(one).getByRole("button", { name: /2 copies/ })).toBeInTheDocument();
    // Only on one source: no choice, so no reason shown.
    expect(within(chapterRow("Vol. 2 · Chapter 12")).queryByRole("button", { name: /copies/ })).not.toBeInTheDocument();
    // Extras keep their own row, last.
    expect(screen.getAllByText("Extra: Character sketches")).toHaveLength(2);
  });

  it("shows every copy and pins one by hand", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(
      await within(await waitFor(() => chapterRow("Vol. 1 · Chapter 3"))).findByRole("button", { name: /2 copies/ }),
    );
    const copies = await screen.findByRole("list", { name: "Copies of Vol. 1 · Chapter 3" });
    expect(within(copies).getByText("Chosen")).toBeInTheDocument();
    await userEvent.click(within(copies).getByRole("button", { name: "Use this copy" }));
    expect(
      await within(chapterRow("Vol. 1 · Chapter 3")).findByText(/Sample Scans · .* · chosen by hand/),
    ).toBeInTheDocument();
    expect(within(chapterRow("Vol. 1 · Chapter 3")).getByLabelText("Copy chosen by hand")).toBeInTheDocument();
    await userEvent.click(
      within(await screen.findByRole("list", { name: "Copies of Vol. 1 · Chapter 3" })).getByRole("button", {
        name: "Unpin",
      }),
    );
    expect(
      await within(chapterRow("Vol. 1 · Chapter 3")).findByText(/Example Source · .* · first source/),
    ).toBeInTheDocument();
  });

  it("marks chapters read, and everything before one", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(
      await within(await waitFor(() => chapterRow("Vol. 1 · Chapter 4"))).findByRole("button", { name: /More for/ }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark earlier chapters as read" }));
    expect(await screen.findByText(/^15 chapters · 12 unread$/)).toBeInTheDocument();
    // Read ones are dimmed, and say so.
    expect(screen.getByRole("link", { name: "Vol. 1 · Chapter 2 (read)" })).toBeInTheDocument();

    await userEvent.click(within(chapterRow("Vol. 1 · Chapter 2 (read)")).getByRole("button", { name: /More for/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark as unread" }));
    expect(await screen.findByText(/^15 chapters · 13 unread$/)).toBeInTheDocument();
  });

  it("filters to unread, newest first, from the URL", async () => {
    const user = db().users[0];
    const first = (await import("@/mocks/chapters")).unifiedChapters(db(), workId, user?.id ?? "")[0];
    db().progress[user?.id ?? ""] = {
      [first?.chapter.id ?? ""]: {
        chapter_id: first?.chapter.id ?? "",
        page: 0,
        completed: true,
        updated_at: new Date().toISOString(),
      },
    };
    const { router } = await renderApp(`/works/${workId}?unread=true&order=desc`);
    await screen.findByText(/^15 chapters · 14 unread$/);
    expect(screen.queryByRole("link", { name: "Vol. 1 · Chapter 1" })).not.toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Chapters" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Extra: Character sketches");
    await userEvent.click(screen.getByRole("button", { name: "Filter, sort and display (1 filters on)" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Unread" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("unread"));
    expect(router.state.location.search).toMatchObject({ order: "desc" });
  });

  it("bookmarks chapters one by one or in batch, and filters to them", async () => {
    const { router } = await renderApp(`/works/${workId}`);
    await userEvent.click(
      await within(await waitFor(() => chapterRow("Vol. 1 · Chapter 3"))).findByRole("button", { name: /More for/ }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Bookmark" }));
    expect(await within(chapterRow("Vol. 1 · Chapter 3")).findByLabelText("Bookmarked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Select chapters" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Vol. 1 · Chapter 4" }));
    await userEvent.click(
      within(screen.getByRole("toolbar", { name: "Selected chapters" })).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Bookmark" }));
    expect(await within(chapterRow("Vol. 1 · Chapter 4")).findByLabelText("Bookmarked")).toBeInTheDocument();

    await router.navigate({ to: "/works/$workId", params: { workId }, search: { bookmarked: true } });
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Chapters" })).getAllByRole("link")).toHaveLength(2),
    );
  });

  it("checks for new chapters from the menu", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(await screen.findByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Check for new chapters" }));
    expect(await screen.findByText("Checking 2 sources…")).toBeInTheDocument();
  });

  it("selects chapters and marks them read at once", async () => {
    await renderApp(`/works/${workId}`);
    await screen.findByText(/^15 chapters · 15 unread$/);
    await userEvent.click(screen.getByRole("button", { name: "Select chapters" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Vol. 1 · Chapter 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Vol. 1 · Chapter 2" }));
    const bar = screen.getByRole("toolbar", { name: "Selected chapters" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark as read" }));
    expect(await screen.findByText(/^15 chapters · 13 unread$/)).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Selected chapters" })).not.toBeInTheDocument();
  });

  it("has a tab per source with that source's own list", async () => {
    const { router } = await renderApp(`/works/${workId}`);
    // Each source's tab shows its language.
    await userEvent.click(await screen.findByRole("tab", { name: "Sample Scans en" }));
    const list = await screen.findByRole("list", { name: /Chapters on Tourou no Bannin/ });
    expect(within(list).getByText("Chapter 5.5: Side story")).toBeInTheDocument();
    expect(within(list).getAllByText(/Sample Scans Team/).length).toBeGreaterThan(0);
    expect(router.state.location.search).toMatchObject({ tab: expect.stringMatching(/^series:/) });
  });
});
