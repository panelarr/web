// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { unifiedChapters } from "@/mocks/chapters";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";
import { startPage } from "./reader-screen";

function seed(entryId: string) {
  const user = db().users[0];
  if (!user) throw new Error("no user");
  for (const source of db().sources) source.health = { status: "ok" };
  addToLibrary(user, entryId);
  tickMatching(db());
  const work = db().works.find((w) => w.entry_id === entryId);
  const chapters = unifiedChapters(db(), work?.id ?? "", user.id).map((c) => c.chapter);
  return { user, work, chapters };
}

let ctx: ReturnType<typeof seed>;
beforeEach(() => {
  ctx = seed("ent_1000"); // a manga: single page, right to left
  // No slide animations in jsdom (it never ends a CSS transition).
  db().readerSettings[ctx.user.id] = { global: { transition: "none" } };
});

const pageText = () => screen.getByText(/^Page \d+ of \d+$|^End of the chapter$|^Start of the chapter$/);

describe("the reader", () => {
  it("opens a manga page by page, right to left, with the bars showing", async () => {
    const first = ctx.chapters[0];
    await renderApp(`/read/${first?.id}`);
    expect(await screen.findByText("The Lantern Keeper")).toBeInTheDocument();
    expect(screen.getByTestId("paged-viewer")).toBeInTheDocument();
    expect(pageText()).toHaveTextContent("Page 1 of 11");
    expect(screen.getByRole("slider", { name: "Page" })).toHaveAttribute("dir", "rtl");
  });

  it("turns pages with the keyboard, following the reading direction, and saves progress", async () => {
    const first = ctx.chapters[0];
    await renderApp(`/read/${first?.id}`);
    await screen.findByText("The Lantern Keeper");
    await userEvent.keyboard("{ArrowLeft}");
    expect(pageText()).toHaveTextContent("Page 2 of 11");
    await waitFor(() => expect(db().progress[ctx.user.id]?.[first?.id ?? ""]?.page).toBe(1));
    await userEvent.keyboard("{ArrowRight}");
    expect(pageText()).toHaveTextContent("Page 1 of 11");
  });

  it("resumes where the user left off", async () => {
    const first = ctx.chapters[0];
    db().progress[ctx.user.id] = {
      [first?.id ?? ""]: {
        chapter_id: first?.id ?? "",
        page: 6,
        pages: 11,
        completed: false,
        updated_at: new Date().toISOString(),
      },
    };
    await renderApp(`/read/${first?.id}`);
    await screen.findByText("The Lantern Keeper");
    expect(pageText()).toHaveTextContent("Page 7 of 11");
  });

  it("ends a chapter by marking it read and offering the next one", async () => {
    const [first, second] = ctx.chapters;
    const { router } = await renderApp(`/read/${first?.id}?page=last`);
    await screen.findByText("The Lantern Keeper");
    expect(pageText()).toHaveTextContent("Page 11 of 11");
    await userEvent.keyboard(" ");
    expect(await screen.findByText("Finished")).toBeInTheDocument();
    await waitFor(() => expect(db().progress[ctx.user.id]?.[first?.id ?? ""]?.completed).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Read the next chapter" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${second?.id}`));
    expect((await screen.findAllByText(/Vol\. 1 · Chapter 2/)).length).toBeGreaterThan(0);
  });

  it("goes back into the previous chapter at its last page", async () => {
    const [first, second] = ctx.chapters;
    const { router } = await renderApp(`/read/${second?.id}`);
    await screen.findByText("The Lantern Keeper");
    await userEvent.keyboard("[[");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${first?.id}`));
    expect(router.state.location.search).toEqual({ page: "last" });
  });

  it("saves a setting for the series, saying where each comes from", async () => {
    await renderApp(`/read/${ctx.chapters[0]?.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Reader settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Reader settings" });
    expect(within(sheet).getByRole("radio", { name: "This series" })).toBeChecked();
    await userEvent.selectOptions(within(sheet).getByLabelText(/^Direction/), "ltr");
    await waitFor(() =>
      expect(db().readerSettings[ctx.user.id]?.[`work:${ctx.work?.id}`]).toEqual({ direction: "ltr" }),
    );
    expect(within(sheet).getAllByText("This series").length).toBeGreaterThan(1);
    expect(screen.getByRole("slider", { name: "Page", hidden: true })).toHaveAttribute("dir", "ltr");

    // For the whole source instead.
    await userEvent.click(within(sheet).getByRole("radio", { name: "Example Source" }));
    await userEvent.selectOptions(within(sheet).getByLabelText(/^Fit/), "width");
    await waitFor(() => expect(db().readerSettings[ctx.user.id]?.["source:example:1001"]).toEqual({ fit: "width" }));

    await userEvent.click(within(sheet).getByRole("button", { name: "Reset this series" }));
    await waitFor(() => expect(db().readerSettings[ctx.user.id]?.[`work:${ctx.work?.id}`]).toBeUndefined());
  });

  it("reads a manhwa as a webtoon strip by default", async () => {
    const manhwa = seed("ent_1001");
    await renderApp(`/read/${manhwa.chapters[0]?.id}`);
    expect(await screen.findByTestId("strip-viewer")).toBeInTheDocument();
  });

  it("explains a chapter no source has", async () => {
    await renderApp("/read/00000000-0000-4000-8000-000000000000");
    expect(await screen.findByText("The chapter didn't open")).toBeInTheDocument();
  });
});

describe("startPage", () => {
  const data = (progress?: { page: number; completed: boolean }) =>
    ({
      pages: Array.from({ length: 10 }, (_, i) => ({ index: i, url: "" })),
      ...(progress ? { progress: { chapter_id: "c", updated_at: "", ...progress } } : {}),
    }) as unknown as Parameters<typeof startPage>[0];

  it("opens where asked, else where left off, else at the start", () => {
    expect(startPage(data(), 3)).toBe(3);
    expect(startPage(data(), 99)).toBe(9);
    expect(startPage(data(), "last")).toBe(9);
    expect(startPage(data({ page: 4, completed: false }), undefined)).toBe(4);
    expect(startPage(data({ page: 9, completed: true }), undefined)).toBe(0);
  });
});
