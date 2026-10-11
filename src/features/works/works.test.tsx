// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";

function seed(...entryIds: string[]) {
  const user = db().users.find((u) => u.id === db().currentUserId);
  if (!user) throw new Error("nobody signed in");
  for (const id of entryIds) addToLibrary(user, id);
  tickMatching(db());
  return db().works;
}

const row = (name: string) => screen.getByText(name, { selector: "span.font-medium" }).closest("li") as HTMLElement;

beforeEach(() => {
  // Both sources healthy, so matching ends matched on one and with candidates on the other.
  for (const source of db().sources) source.health = { status: "ok" };
});

describe("the library", () => {
  it("invites to browse when empty", async () => {
    await renderApp("/");
    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the catalogue" })).toHaveAttribute("href", "/browse");
  });

  it("shows works, searches them, and sorts by new chapters", async () => {
    seed("ent_1000", "ent_1001", "ent_1002");
    const entry = db().library.find((e) => db().works.find((w) => w.id === e.work_id)?.title === "Iron Garden");
    if (entry) entry.new_chapters = 4;
    const { router } = await renderApp("/");
    expect(await screen.findByText("The Lantern Keeper")).toBeInTheDocument();
    expect(screen.getByText("3 works")).toBeInTheDocument();
    expect(screen.getByText("4")).toHaveTextContent("4 new chapters");

    await userEvent.click(screen.getByRole("button", { name: /New chapters/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ only: "new" }));
    expect(screen.queryByText("The Lantern Keeper")).not.toBeInTheDocument();
    expect(screen.getByText("Iron Garden")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /New chapters/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search your library" }), "moon");
    await waitFor(() => expect(screen.queryByText("Iron Garden")).not.toBeInTheDocument());
    expect(screen.getByText("Moonlit Bakery")).toBeInTheDocument();
  });
});

describe("fixing matches", () => {
  it("shows how the work is matched on each source, with evidence", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    expect(await screen.findByText("Attached on 1 of 2 sources.")).toBeInTheDocument();
    const example = row("Example Source");
    expect(within(example).getByText("Matched")).toBeInTheDocument();
    expect(within(example).getByText("Attached automatically")).toBeInTheDocument();
    expect(
      within(example).getByText(/Matched “The Lantern Keeper” · title 100% · authors match · \d+ chapters/),
    ).toBeInTheDocument();
    const sample = row("Sample Scans");
    expect(within(sample).getByText("Needs a decision")).toBeInTheDocument();
    expect(within(sample).getByText(/Searched: The Lantern Keeper/)).toBeInTheDocument();
  });

  it("attaches a candidate, rejects another, and detaches", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    const sample = await waitFor(() => row("Sample Scans"));
    const [, second] = within(sample).getAllByRole("button", { name: /^Not / });
    await userEvent.click(second as HTMLElement);
    expect(await within(row("Sample Scans")).findByText("1 rejected series")).toBeInTheDocument();

    await userEvent.click(within(row("Sample Scans")).getByRole("button", { name: "Attach" }));
    expect(await screen.findByText("Attached on 2 of 2 sources.")).toBeInTheDocument();

    await userEvent.click(within(row("Example Source")).getByRole("button", { name: "Detach" }));
    expect(await screen.findByText("Attached on 1 of 2 sources.")).toBeInTheDocument();
    expect(within(row("Example Source")).getByText("1 rejected series")).toBeInTheDocument();
  });

  it("sets a series' priority", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    const priority = await screen.findByLabelText("Priority");
    await userEvent.clear(priority);
    await userEvent.type(priority, "10{Enter}");
    await waitFor(() => expect(db().matching[work?.id ?? ""]?.[0]?.attached?.priority).toBe(10));
  });

  it("attaches by URL, explaining an unknown one", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    await userEvent.click(await screen.findByRole("button", { name: "Attach by URL" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Series URL"), "https://unknown.example/x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
    expect(await within(dialog).findByText("No plugin recognises that URL.")).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText("Series URL"));
    await userEvent.type(within(dialog).getByLabelText("Series URL"), "https://example.com/1002/series/1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
    expect(await screen.findByText("Attached on 2 of 2 sources.")).toBeInTheDocument();
  });

  it("searches a source by hand and attaches the result", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    await userEvent.click(
      await within(await waitFor(() => row("Sample Scans"))).findByRole("button", {
        name: "Search Sample Scans yourself",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    const search = within(dialog).getByRole("textbox", { name: "Search the source" });
    await userEvent.clear(search);
    await userEvent.type(search, "Tourou");
    await userEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Attach" }));
    expect(await screen.findByText("Attached on 2 of 2 sources.")).toBeInTheDocument();
  });

  it("is read-only without the right to fix matches", async () => {
    resetDb("user");
    for (const source of db().sources) source.health = { status: "ok" };
    const reader = db().users.find((u) => u.username === "reader");
    if (reader) reader.grants.all_sources = true;
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    expect(await screen.findByText(/Ask your admin to fix matches/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Detach" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach by URL" })).not.toBeInTheDocument();
  });

  it("updates live while matching runs", async () => {
    const user = db().users[0];
    if (!user) throw new Error("no user");
    addToLibrary(user, "ent_1002");
    const work = db().works[0];
    await renderApp(`/works/${work?.id}?tab=sources`);
    expect((await screen.findAllByText("Searching…")).length).toBe(2);
    act(() => {
      tickMatching(db());
    });
    expect(await screen.findByText("Attached on 1 of 2 sources.", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("removes a work from the library after confirming", async () => {
    const [work] = seed("ent_1000");
    await renderApp(`/works/${work?.id}?tab=sources`);
    await userEvent.click(await screen.findByRole("button", { name: "In library" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(db().library).toHaveLength(0));
    expect(await screen.findByRole("button", { name: "Add to library" })).toBeInTheDocument();
  });
});
