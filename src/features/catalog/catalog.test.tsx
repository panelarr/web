// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { mockUrl } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { countFilters, validateCatalogSearch } from "./filters";

describe("validateCatalogSearch", () => {
  it("keeps what the server accepts and drops the rest", () => {
    expect(
      validateCatalogSearch({
        q: "  lantern ",
        type: "manga",
        status: ["completed", "Bad Value"],
        genre: ["Drama"],
        year_from: "2010",
        year_to: 99999,
        sort: "title",
        reverse: "true",
        extra: "x",
      }),
    ).toEqual({
      q: "  lantern ",
      type: ["manga"],
      status: ["completed"],
      genre: ["Drama"],
      year_from: 2010,
      sort: "title",
      reverse: true,
    });
    expect(validateCatalogSearch({ sort: "nonsense", q: "   " })).toEqual({});
  });

  it("counts the filters in use", () => {
    expect(countFilters({ q: "x", type: ["manga", "manhwa"], year_to: 2020, sort: "year" })).toBe(3);
  });
});

describe("browsing the catalogue", () => {
  it("lists works and filters them from the filter panel", async () => {
    const { router } = await renderApp("/browse");
    expect(await screen.findByText("The Lantern Keeper")).toBeInTheDocument();
    expect(screen.getByText(/^\d+ works$/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const panel = await screen.findByRole("dialog", { name: "Filters" });
    await userEvent.click(within(panel).getByRole("button", { name: "Manhwa" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Show results" }));

    await waitFor(() => expect(router.state.location.search).toEqual({ type: ["manhwa"] }));
    expect(await screen.findByText("Moonlit Bakery")).toBeInTheDocument();
    expect(screen.queryByText("The Lantern Keeper")).not.toBeInTheDocument();

    // The filter shows as a chip; removing it brings everything back.
    await userEvent.click(screen.getByRole("button", { name: "Remove filter Manhwa" }));
    expect(await screen.findByText("The Lantern Keeper")).toBeInTheDocument();
  });

  it("searches every title once typing pauses, saying which one matched", async () => {
    const { router } = await renderApp("/browse");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search the catalogue" }), "tsukiyo");
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "tsukiyo" }));
    expect(await screen.findByText("Moonlit Bakery")).toBeInTheDocument();
    expect(screen.getByText("“Tsukiyo no Panya”")).toBeInTheDocument();
    expect(screen.getByText("1 work")).toBeInTheDocument();
  });

  it("says when the catalogue has no entries at all", async () => {
    server.use(
      http.get(mockUrl("/catalog/browse"), () =>
        HttpResponse.json({ entries: [], next_page_token: "", no_providers: false }),
      ),
    );
    await renderApp("/browse");
    expect(await screen.findByText("The catalogue is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check the metadata service" })).toHaveAttribute("href", "/admin/system");
  });

  it("says when nothing matches", async () => {
    await renderApp("/browse?q=zzzz");
    expect(await screen.findByText("Nothing found for “zzzz”")).toBeInTheDocument();
  });

  it("hides works above the user's content ceiling", async () => {
    resetDb("user");
    await renderApp("/browse?q=Ninth");
    expect(await screen.findByText("Nothing found for “Ninth”")).toBeInTheDocument();
  });
});

describe("a catalogue entry", () => {
  it("shows the work, with an HTML description as plain text", async () => {
    await renderApp("/catalog/ent_1001");
    expect(await screen.findByRole("heading", { level: 1, name: "Moonlit Bakery" })).toBeInTheDocument();
    expect(screen.getAllByText(/Tsukiyo no Panya/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ren Tachibana")).toBeInTheDocument();
    const description = screen.getByRole("region", { name: "Description" });
    expect(description.textContent).toContain("Moonlit Bakery follows a small cast");
    expect(description.querySelector("b")).toBeNull();
    expect(screen.getByRole("link", { name: /Publisher page/ })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByText(/Data from/)).toHaveTextContent("Data from example-provider · CC BY 4.0");
  });

  it("hides spoiler tags until asked", async () => {
    await renderApp("/catalog/ent_1000");
    expect(await screen.findByText("Found Family")).toBeInTheDocument();
    expect(screen.queryByText("Twist Ending")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show 1 spoiler tag" }));
    expect(screen.getByText("Twist Ending")).toBeInTheDocument();
  });

  it("adds the work to the library, then marks it while browsing", async () => {
    const { router } = await renderApp("/catalog/ent_1000");
    const [add] = await screen.findAllByRole("button", { name: "Add to library" });
    await userEvent.click(add as HTMLElement);
    expect((await screen.findAllByText("In your library")).length).toBeGreaterThan(0);
    expect(db().library).toHaveLength(1);
    expect(db().works[0]?.entry_id).toBe("ent_1000");

    await router.navigate({ to: "/browse" });
    const card = (await screen.findByText("The Lantern Keeper")).closest("a") as HTMLElement;
    expect(within(card).getByText("In library")).toBeInTheDocument();
  });

  it("can't be added without the right", async () => {
    resetDb("user");
    const reader = db().users.find((u) => u.username === "reader");
    if (reader) reader.grants.may_add = false;
    await renderApp("/catalog/ent_1000");
    const [add] = await screen.findAllByRole("button", { name: "Add to library" });
    expect(add).toBeDisabled();
    expect(screen.getAllByText("You may not add works. Ask your admin.").length).toBeGreaterThan(0);
  });

  it("says when an entry can't be found", async () => {
    await renderApp("/catalog/ent_9999");
    expect(await screen.findByText("Not in the catalogue")).toBeInTheDocument();
  });
});
