// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { storePlugin } from "@/mocks/data";
import { db } from "@/mocks/db";
import { mockUrl, problem } from "@/mocks/op";
import { tickPackages } from "@/mocks/packages";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const UPDATES = "/admin/updates";
const section = (name: string) => screen.getByRole("region", { name });
const run = () =>
  act(() => {
    for (let i = 0; i < 4; i++) tickPackages(db());
  });

/** A second plugin that manages packages, with none to update. */
function addShelfPlugin(enabled = true) {
  db().plugins.push({ ...storePlugin, id: "shelf", plugin_id: "shelf", name: "Example Shelf Plugin", enabled });
  db().packages.shelf = [];
}

/** Lantern Reader installed at an older version, so the store plugin has two updates. */
function lanternOutdated() {
  const lantern = db().packages.stores?.find((p) => p.id === "org.example.lantern");
  if (!lantern) throw new Error("no Lantern Reader");
  Object.assign(lantern, { installed: true, installed_version: "1.4.0", update_available: true });
}

describe("Admin → Updates", () => {
  it("lists each packages plugin's updates, installed → new, with a link to its extensions", async () => {
    addShelfPlugin();
    await renderApp(UPDATES);
    expect(await screen.findByRole("heading", { name: "Updates" })).toBeInTheDocument();
    const stores = await waitFor(() => section("Example Store Plugin"));
    const list = await within(stores).findByRole("list", { name: "Updates from Example Store Plugin" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Polyglot Comics")).toBeInTheDocument();
    expect(list).toHaveTextContent("v2.0.0 → v2.1.0");
    expect(within(stores).getByRole("link", { name: "Its extensions" })).toHaveAttribute(
      "href",
      "/admin/plugins/stores?tab=extensions&show=updates",
    );
    expect(await within(section("Example Shelf Plugin")).findByText("Everything is up to date.")).toBeInTheDocument();
    // A plugin without packages has no section.
    expect(screen.queryByRole("region", { name: "Example Source Plugin" })).not.toBeInTheDocument();
    expect(screen.getByText("1 extension has an update.")).toBeInTheDocument();
  });

  it("says a plugin is off in one line, without asking it", async () => {
    addShelfPlugin(false);
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname.endsWith("/plugins/shelf/packages")) asked.push(request.url);
    });
    await renderApp(UPDATES);
    expect(
      await within(await waitFor(() => section("Example Shelf Plugin"))).findByText(/Turned off/),
    ).toBeInTheDocument();
    expect(await within(section("Example Store Plugin")).findByText("Polyglot Comics")).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  it("shows a failing plugin's error in its section, and the others carry on", async () => {
    addShelfPlugin();
    server.use(
      http.get(mockUrl("/plugins/shelf/packages"), () =>
        problem(502, "store_fetch_failed", "Store unavailable", "The shelf store answered 503."),
      ),
    );
    await renderApp(UPDATES);
    const shelf = await waitFor(() => section("Example Shelf Plugin"));
    expect(await within(shelf).findByText("The shelf store answered 503.")).toBeInTheDocument();
    expect(within(shelf).getByText("A store couldn't be read")).toBeInTheDocument();
    expect(await within(section("Example Store Plugin")).findByText("Polyglot Comics")).toBeInTheDocument();
  });

  it("doesn't wait for a slow store", async () => {
    addShelfPlugin();
    server.use(
      http.get(mockUrl("/plugins/shelf/packages"), async () => {
        await delay("infinite");
      }),
    );
    await renderApp(UPDATES);
    expect(
      await within(await waitFor(() => section("Example Store Plugin"))).findByText("Polyglot Comics"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 extension has an update so far.")).toBeInTheDocument();
  });

  it("updates one, which then leaves the list", async () => {
    await renderApp(UPDATES);
    const stores = await waitFor(() => section("Example Store Plugin"));
    await userEvent.click(await within(stores).findByRole("button", { name: "Update" }));
    expect(await within(stores).findByRole("status")).toHaveTextContent("Updating Polyglot Comics");
    run();
    expect(await screen.findByText("Polyglot Comics updated.")).toBeInTheDocument();
    expect(await within(stores).findByText("Everything is up to date.")).toBeInTheDocument();
    expect(db().packages.stores?.find((p) => p.id === "org.example.polyglot")).toMatchObject({
      installed_version: "2.1.0",
      update_available: false,
    });
  });

  it("updates all of a plugin's, asked first", async () => {
    lanternOutdated();
    const updates: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/update")) updates.push(new URL(request.url).pathname);
    });
    await renderApp(UPDATES);
    const stores = await waitFor(() => section("Example Store Plugin"));
    await userEvent.click(await within(stores).findByRole("button", { name: "Update all (2)" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Update 2 extensions of Example Store Plugin?");
    // Cancelling starts nothing.
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(updates).toEqual([]);

    await userEvent.click(within(stores).getByRole("button", { name: "Update all (2)" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Update all" }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates.sort()).toEqual([
      "/api/v1/plugins/stores/packages/org.example.lantern/update",
      "/api/v1/plugins/stores/packages/org.example.polyglot/update",
    ]);
    run();
    expect(await screen.findByText("Polyglot Comics updated.")).toBeInTheDocument();
    expect(await screen.findByText("Lantern Reader updated.")).toBeInTheDocument();
    expect(await within(stores).findByText("Everything is up to date.")).toBeInTheDocument();
  });

  it("says so when no plugin manages extensions", async () => {
    db().plugins = db().plugins.filter((p) => !p.capabilities.includes("packages"));
    await renderApp(UPDATES);
    expect(await screen.findByText("No plugin manages extensions")).toBeInTheDocument();
  });
});
