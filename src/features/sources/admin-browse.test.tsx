// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

describe("browsing sources", () => {
  it("links each source in Admin → Sources to its own lists", async () => {
    await renderApp("/admin/sources");
    const link = await screen.findByRole("link", { name: "Example Source" });
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toBe("/admin/sources/example:1001");
  });

  it("tells Off from Absent, and names plugins in the filter", async () => {
    const gone = db().sources.find((source) => source.id === "example:1002");
    if (gone) gone.present = false;
    const { router } = await renderApp("/admin/sources");
    const off = (await screen.findByText("Demo Comics")).closest("li") as HTMLElement;
    expect(within(off).getByText("Off")).toBeInTheDocument();
    // Sources that don't exist for anyone now are hidden, and counted, until asked for.
    expect(screen.queryByText("Sample Scans")).not.toBeInTheDocument();
    expect(screen.getByText(/· 3 hidden\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show hidden (3)" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ hidden: true }));
    const absent = screen.getByText("Sample Scans").closest("li") as HTMLElement;
    expect(within(absent).getByText("Absent")).toBeInTheDocument();
    expect(within(absent).getByText(/No longer listed by its plugin/)).toBeInTheDocument();
    expect(within(absent).queryByText("Off")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Example Source Plugin" })).toBeInTheDocument();
  });

  it("shows each source's extension, and tells Not available apart", async () => {
    const { router } = await renderApp("/admin/sources?package=org.example.polyglot");
    expect(await screen.findByText("Extension:")).toBeInTheDocument();
    // Only the one that exists for anyone, until the hidden ones are shown.
    expect(await screen.findAllByText("via Polyglot Comics")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Show hidden (2)" }));
    const rows = await screen.findAllByText("via Polyglot Comics");
    expect(rows).toHaveLength(3);
    const row = (lang: string) =>
      rows.map((el) => el.closest("li") as HTMLElement).find((li) => within(li).queryByText(lang)) as HTMLElement;
    // English: its language is turned off for the extension.
    expect(within(row("en")).getByText("Not available")).toBeInTheDocument();
    expect(within(row("en")).getByText(/Its language is turned off/)).toBeInTheDocument();
    expect(within(row("en")).queryByText("Absent")).not.toBeInTheDocument();
    // Japanese: listed, but the admin turned it off.
    expect(within(row("ja")).getByText("Off")).toBeInTheDocument();
    expect(within(row("ja")).queryByText("Not available")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "unavailable");
    await waitFor(() => expect(screen.getAllByText("via Polyglot Comics")).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Show every extension's sources" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ status: "unavailable", hidden: true }));
  });

  it("browses a source that's turned off, to test it, but not one that's absent", async () => {
    const { router } = await renderApp("/admin/sources/example:1003");
    expect(await screen.findByRole("heading", { name: "Demo Comics" })).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    // Its lists are fetched, not refused.
    expect(await screen.findByText("灯籠の番人")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Lists" })).toBeInTheDocument();

    const gone = db().sources.find((source) => source.id === "example:1002");
    if (gone) gone.present = false;
    await router.navigate({ to: "/admin/sources/$sourceId", params: { sourceId: "example:1002" } });
    expect(await screen.findByText("No longer listed by its plugin")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Lists" })).not.toBeInTheDocument();
  });

  it("takes admins from old Browse → Sources links to the same page in Admin, search kept", async () => {
    const { router } = await renderApp("/browse/sources/example:1001?list=search&q=the");
    await waitFor(() => expect(decodeURIComponent(router.state.location.pathname)).toBe("/admin/sources/example:1001"));
    expect(router.state.location.search).toMatchObject({ list: "search", q: "the" });
    await router.navigate({ href: "/browse/sources/example:1001/series?key=%2Fseries%2F1000" });
    await waitFor(() =>
      expect(decodeURIComponent(router.state.location.pathname)).toBe("/admin/sources/example:1001/series"),
    );
    expect(router.state.location.search).toEqual({ key: "/series/1000" });
    await router.navigate({ href: "/browse/sources" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/sources"));
  });

  it("is for admins only: everyone else lands on Browse, with no Sources tab", async () => {
    resetDb("user");
    const { router } = await renderApp("/browse/sources/example:1001");
    await waitFor(() => expect(router.state.location.pathname).toBe("/browse"));
    expect(screen.queryByRole("link", { name: "Sources" })).not.toBeInTheDocument();
    await router.navigate({ to: "/admin/sources/$sourceId", params: { sourceId: "example:1001" } });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("shows a source's popular list and pages through it", async () => {
    await renderApp("/admin/sources/example:1001");
    expect(await screen.findByRole("heading", { name: "Example Source" })).toBeInTheDocument();
    expect(await screen.findByText("The Lantern Keeper")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Blue Hour Racers")).toBeInTheDocument();
  });

  it("searches with the source's own filters, sending only what changed", async () => {
    const bodies: unknown[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/search")) bodies.push(await request.clone().json());
    });
    const { router } = await renderApp("/admin/sources/example:1001?list=search");
    await userEvent.click(await screen.findByRole("button", { name: /Filters/ }));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Action: any" }));
    await userEvent.selectOptions(within(sheet).getByLabelText("Status"), "Completed");
    await userEvent.click(within(sheet).getByRole("button", { name: "Search" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      query: "",
      page: 1,
      filters: [
        { path: [2], select: 2 },
        { path: [6, 0], triState: "TRI_STATE_INCLUDE" },
      ],
    });
    expect(router.state.location.search).toMatchObject({
      list: "search",
      filters: { "2": { kind: "select", value: 2 } },
    });
  });

  it("adds a clearly matched series straight to the library", async () => {
    const { router } = await renderApp("/admin/sources/example:1001/series?key=%2Fseries%2F1000");
    expect(await screen.findByRole("heading", { name: "The Lantern Keeper" })).toBeInTheDocument();
    expect(await screen.findByText(/Chapters \(\d+\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/works\//));
    expect(db().library).toHaveLength(1);
  });

  it("asks which work it is when the match isn't clear", async () => {
    const { router } = await renderApp("/admin/sources/example:1002/series?key=%2Fseries%2F1000");
    await userEvent.click(await screen.findByRole("button", { name: "Add to library" }));
    const dialog = await screen.findByRole("dialog", { name: "Which work is it?" });
    expect(within(dialog).getByText("The Lantern Keeper")).toBeInTheDocument();
    await userEvent.click(within(dialog).getAllByRole("button", { name: "This one" })[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/works\//));
    const work = db().works[0];
    expect(db().matching[work?.id ?? ""]?.find((r) => r.source.id === "example:1002")?.attached?.key).toBe(
      "/series/1000",
    );
  });
});
