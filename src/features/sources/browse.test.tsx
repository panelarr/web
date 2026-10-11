// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

describe("browsing sources", () => {
  it("lists the sources the user may use", async () => {
    await renderApp("/browse/sources");
    expect(await screen.findByText("Example Source")).toBeInTheDocument();
    expect(screen.getByText("Sample Scans")).toBeInTheDocument();
    expect(screen.queryByText("Demo Comics")).not.toBeInTheDocument(); // turned off
    expect(screen.getByRole("link", { name: "Sources" })).toHaveAttribute("data-status", "active");
  });

  it("shows a source's popular list and pages through it", async () => {
    await renderApp("/browse/sources/example:1001");
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
    const { router } = await renderApp("/browse/sources/example:1001?list=search");
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
    const { router } = await renderApp("/browse/sources/example:1001/series?key=%2Fseries%2F1000");
    expect(await screen.findByRole("heading", { name: "The Lantern Keeper" })).toBeInTheDocument();
    expect(await screen.findByText(/Chapters \(\d+\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/works\//));
    expect(db().library).toHaveLength(1);
  });

  it("asks which work it is when the match isn't clear", async () => {
    const { router } = await renderApp("/browse/sources/example:1002/series?key=%2Fseries%2F1000");
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
