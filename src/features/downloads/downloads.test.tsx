// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { tickDownloads } from "@/mocks/downloads";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";

function seedWork() {
  const user = db().users.find((u) => u.id === db().currentUserId);
  if (!user) throw new Error("nobody signed in");
  for (const source of db().sources) source.health = { status: "ok" };
  addToLibrary(user, "ent_1000");
  tickMatching(db());
  return db().works[0]?.id ?? "";
}

const chapterRow = (label: string) => screen.getByRole("link", { name: label }).closest("li") as HTMLElement;
const downloadTasks = () => db().tasks.filter((t) => t.kind === "download.chapter" && t.payload.chapter_id);

let workId = "";
beforeEach(() => {
  workId = seedWork();
});

describe("downloading from a work", () => {
  it("queues the unread chapters and follows them live until stored", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(await screen.findByRole("button", { name: "Download" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unread chapters" }));
    expect(await screen.findByText(/^Downloads: \d+ queued\.$/)).toBeInTheDocument();
    expect(await within(chapterRow("Vol. 1 · Chapter 1")).findByText("Queued")).toBeInTheDocument();

    act(() => {
      tickDownloads(db()); // starts two
      tickDownloads(db()); // 4 of 12 pages
    });
    expect(await within(chapterRow("Vol. 1 · Chapter 1")).findByText("Downloading 33%")).toBeInTheDocument();
    act(() => {
      tickDownloads(db());
      tickDownloads(db());
    });
    expect(
      await within(chapterRow("Vol. 1 · Chapter 1")).findByLabelText("Downloaded", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("queues a chapter and the ones after it, never twice", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(
      await within(await waitFor(() => chapterRow("Vol. 2 · Chapter 11"))).findByRole("button", { name: /More for/ }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Download this and later chapters" }));
    // Chapters 11 and 12, and the extra.
    await waitFor(() => expect(downloadTasks()).toHaveLength(3));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "All chapters" }));
    await waitFor(() => expect(downloadTasks()).toHaveLength(14));
  });

  it("downloads new chapters automatically when asked", async () => {
    await renderApp(`/works/${workId}`);
    await userEvent.click(await screen.findByRole("button", { name: "Download" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "New chapters automatically" }));
    await waitFor(() => expect(db().library[0]?.auto_download).toBe(true));
  });

  it("isn't offered without the right to download", async () => {
    resetDb("user");
    const reader = db().users.find((u) => u.username === "reader");
    if (reader) reader.grants.all_sources = true;
    const id = seedWork();
    await renderApp(`/works/${id}`);
    await screen.findByRole("button", { name: "Check for new" });
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("lets admins delete a downloaded file", async () => {
    const [first] = (await import("@/mocks/chapters")).unifiedChapters(db(), workId, db().users[0]?.id ?? "");
    db().downloaded.push(first?.chapter.id ?? "");
    await renderApp(`/works/${workId}`);
    await userEvent.click(
      await within(await waitFor(() => chapterRow("Vol. 1 · Chapter 1"))).findByRole("button", { name: /More for/ }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete the downloaded file" }));
    await waitFor(() => expect(db().downloaded).toHaveLength(0));
  });
});

describe("the downloads page", () => {
  async function queueTwo() {
    const { unifiedChapters } = await import("@/mocks/chapters");
    const { queueDownload } = await import("@/mocks/downloads");
    const user = db().users[0];
    const work = db().works[0];
    for (const { chapter } of unifiedChapters(db(), workId, user?.id ?? "").slice(0, 4)) {
      queueDownload(db(), chapter, { id: workId, title: work?.title ?? "" }, user?.id ?? "");
    }
    tickDownloads(db()); // one starts (the other slot is busy)
  }

  it("lists downloads with live progress, filters them, and lets admins cancel and retry", async () => {
    await queueTwo();
    const { router } = await renderApp("/downloads");
    expect((await screen.findAllByText("The Lantern Keeper")).length).toBeGreaterThan(2);
    await userEvent.click(screen.getByRole("button", { name: "Downloading" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ state: "running" }));
    // Two at a time: one slot is taken by a download from before.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1));

    await userEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0] as HTMLElement);
    await waitFor(() => expect(downloadTasks().filter((t) => t.state === "cancelled")).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Cancelled" }));
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(downloadTasks().filter((t) => t.state === "cancelled")).toHaveLength(0));
  });

  it("pauses and resumes downloads for admins", async () => {
    await renderApp("/downloads");
    await userEvent.click(await screen.findByRole("button", { name: "Pause downloads" }));
    expect(await screen.findByRole("button", { name: "Resume downloads" })).toBeInTheDocument();
    expect(db().pausedKinds).toContain("download.chapter");
  });
});

describe("storage", () => {
  it("lists storages with the default first", async () => {
    await renderApp("/admin/storage");
    const cards = await screen.findAllByRole("heading", { level: 2 });
    expect(cards[0]).toHaveTextContent("Library disk");
    expect(within(cards[0]?.closest("[data-slot=card]") as HTMLElement).getByText("Default")).toBeInTheDocument();
  });

  it("adds a storage after the server checks it", async () => {
    await renderApp("/admin/storage");
    await userEvent.click(await screen.findByRole("button", { name: "Add storage" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("ID"), "nas");
    await userEvent.type(within(dialog).getByLabelText("Name"), "NAS");
    await userEvent.type(within(dialog).getByLabelText("Directory"), "/readonly/nas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText(/read-only file system/)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText("Directory"));
    await userEvent.type(within(dialog).getByLabelText("Directory"), "/mnt/nas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("heading", { name: "NAS" })).toBeInTheDocument();
  });

  it("tests a storage, makes it the default, and moves files", async () => {
    await renderApp("/admin/storage");
    const archive = (await screen.findByRole("heading", { name: "Archive bucket" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    await userEvent.click(within(archive).getByRole("button", { name: "Test" }));
    expect(await within(archive).findByText(/It works/)).toBeInTheDocument();
    await userEvent.click(within(archive).getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(db().storages.find((s) => s.id === "archive")?.default).toBe(true));

    const disk = screen.getByRole("heading", { name: "Library disk" }).closest("[data-slot=card]") as HTMLElement;
    await userEvent.click(within(disk).getByRole("button", { name: "Move files…" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(db().storages.find((s) => s.id === "archive")?.files).toBe(128));
  });

  it("explains why a storage with files can't be removed", async () => {
    db().storages = db().storages.map((s) => (s.id === "archive" ? { ...s, files: 3 } : s));
    await renderApp("/admin/storage");
    const archive = (await screen.findByRole("heading", { name: "Archive bucket" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    await userEvent.click(within(archive).getByRole("button", { name: "Remove" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText(/Move its 3 files to another storage first/)).toBeInTheDocument();
  });
});
