// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { emit } from "@/mocks/events";
import { queuePackageTask, tickPackages } from "@/mocks/packages";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { filterPackages, type Package, packageLanguages, versionLabel } from "./packages";

const EXTENSIONS = "/admin/plugins/stores?tab=extensions";
const row = (name: string) => {
  const list = screen.getByRole("list", { name: "Extensions" });
  return within(list).getByText(name).closest("li") as HTMLElement;
};
const source = (id: string) => db().sources.find((s) => s.id === id);
/** Opens the tab searched for one extension, as an admin finds one in a long list. */
const openOn = async (q: string) => {
  const rendered = await renderApp(`${EXTENSIONS}&q=${encodeURIComponent(q)}`);
  await screen.findByText(/of 64 extensions/);
  return rendered;
};
const run = () =>
  act(() => {
    for (let i = 0; i < 4; i++) tickPackages(db());
  });

describe("the Extensions tab", () => {
  it("is only there for plugins that manage packages", async () => {
    const { router } = await renderApp("/admin/plugins/example");
    expect(await screen.findByRole("heading", { name: "Example Source Plugin" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Extensions" })).not.toBeInTheDocument();

    await router.navigate({ to: "/admin/plugins/$pluginId", params: { pluginId: "stores" } });
    await userEvent.click(await screen.findByRole("tab", { name: "Extensions" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "extensions" }));
    expect(await screen.findByText("64 extensions · 1 installed · 1 with an update")).toBeInTheDocument();
  });

  it("searches and filters by language and state, in the URL", async () => {
    const { router } = await renderApp(EXTENSIONS);
    await screen.findByText(/64 extensions/);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search extensions" }), "night");
    expect(await screen.findByText("1 of 64 extensions · 1 installed · 1 with an update")).toBeInTheDocument();
    expect(row("Night Shelf")).toHaveTextContent(/NSFW/);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"));

    await userEvent.selectOptions(screen.getByLabelText("Language"), "ja");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ lang: "ja" }));
    expect(row("Polyglot Comics")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Show"), "updates");
    expect(await screen.findByText(/^1 of 64 extensions/)).toBeInTheDocument();
    expect(row("Polyglot Comics")).toHaveTextContent("v2.0.0 → v2.1.0");
  });

  it("installs an extension with live progress, and its source appears", async () => {
    await openOn("Lantern");
    await userEvent.click(within(row("Lantern Reader")).getByRole("button", { name: "Install Lantern Reader" }));
    expect(await within(row("Lantern Reader")).findByRole("status")).toHaveTextContent("Installing Lantern Reader");
    run();
    expect(await screen.findByText("Lantern Reader installed.")).toBeInTheDocument();
    await waitFor(() => expect(within(row("Lantern Reader")).getByText("Installed")).toBeInTheDocument());
    expect(source("stores:3101")).toMatchObject({ present: true, package_name: "Lantern Reader" });

    // Its source's own settings, from the extension's details.
    await userEvent.click(within(row("Lantern Reader")).getByRole("button", { name: "Lantern Reader" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(await within(sheet).findByRole("button", { name: "Settings for Lantern Reader" }));
    expect(await screen.findByLabelText("Image quality")).toBeInTheDocument();
  });

  it("updates and uninstalls; an uninstalled extension's sources become absent", async () => {
    await openOn("Polyglot");
    await userEvent.click(within(row("Polyglot Comics")).getByRole("button", { name: "Update" }));
    run();
    expect(await screen.findByText("Polyglot Comics updated.")).toBeInTheDocument();
    await waitFor(() => expect(row("Polyglot Comics")).not.toHaveTextContent("→"));

    await userEvent.click(within(row("Polyglot Comics")).getByRole("button", { name: "Uninstall" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Uninstall" }));
    run();
    expect(await screen.findByText("Polyglot Comics uninstalled.")).toBeInTheDocument();
    expect(source("stores:3002")).toMatchObject({ present: false });
    expect(source("stores:3002")?.unavailable_reason).toBeUndefined();
  });

  it("can't install a version the plugin can't run", async () => {
    await openOn("Old Scans");
    expect(within(row("Old Scans")).getByRole("button", { name: "Install Old Scans" })).toBeDisabled();
    expect(row("Old Scans")).toHaveTextContent("Unsupported");
  });

  it("shows a task started elsewhere, and what it does", async () => {
    const pkg = db().packages.stores?.find((p) => p.id === "org.example.nightshelf");
    if (pkg) queuePackageTask(db(), "stores", pkg, "install", db().users[0]?.id ?? "");
    await openOn("Night");
    expect(
      await within(await waitFor(() => row("Night Shelf"))).findByText(/Installing Night Shelf/),
    ).toBeInTheDocument();
  });

  it("sets an extension's languages, which decide which of its sources are available", async () => {
    const { router } = await openOn("Polyglot");
    await userEvent.click(within(row("Polyglot Comics")).getByRole("button", { name: "Polyglot Comics" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ pkg: "org.example.polyglot" }));
    const sheet = await screen.findByRole("dialog");
    const sources = within(sheet).getByRole("region", { name: "Its sources" });
    expect(within(sources).getAllByText("Not available")).toHaveLength(2);
    expect(source("stores:3001")).toMatchObject({ present: false, unavailable_reason: "language" });

    await userEvent.click(within(sheet).getByRole("checkbox", { name: "en" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save languages" }));
    expect(await screen.findByText("Languages saved.")).toBeInTheDocument();
    await waitFor(() => expect(within(sources).getAllByText("Not available")).toHaveLength(1));
    expect(source("stores:3001")).toMatchObject({ present: true });
    // All off can't be saved; all on is saved as "all".
    await userEvent.click(within(sheet).getByRole("button", { name: "Languages: all off" }));
    expect(within(sheet).getByRole("button", { name: "Save languages" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Languages: all on" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save languages" }));
    await waitFor(() =>
      expect(db().packages.stores?.find((p) => p.id === "org.example.polyglot")?.enabled_langs).toEqual([]),
    );
    expect(within(sheet).getByRole("link", { name: "Open in Sources" })).toHaveAttribute(
      "href",
      "/admin/sources?plugin=stores&package=org.example.polyglot",
    );
  });
});

describe("the store's list", () => {
  it("loads once: health events and reconnects don't reload it, a finished task patches one package", async () => {
    const lists: string[] = [];
    const singles: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const path = new URL(request.url).pathname;
      if (request.method !== "GET") return;
      if (path.endsWith("/plugins/stores/packages")) lists.push(path);
      else if (/\/plugins\/stores\/packages\/[^/]+$/.test(path)) singles.push(path);
    });
    await openOn("Lantern");
    expect(screen.getByText(/^Loaded /)).toBeInTheDocument();
    expect(lists).toHaveLength(1);

    // An idle tab: the plugin is checked again and again, the event stream reconnects.
    for (let i = 0; i < 3; i++) emit("plugin.health", { plugin_id: "stores", health: "ok" });
    emit("ready" as never, {} as never);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(lists).toHaveLength(1);

    // A package changes: only that one is fetched.
    await userEvent.click(within(row("Lantern Reader")).getByRole("button", { name: "Install Lantern Reader" }));
    run();
    expect(await screen.findByText("Lantern Reader installed.")).toBeInTheDocument();
    await waitFor(() => expect(singles).toEqual(["/api/v1/plugins/stores/packages/org.example.lantern"]));
    expect(lists).toHaveLength(1);

    // Reload, when asked.
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(lists).toHaveLength(2));
  });
});

describe("package helpers", () => {
  const pkg = (over: Partial<Package>): Package => ({
    id: "p",
    name: "P",
    langs: ["en"],
    version: "1.0.0",
    installed: false,
    update_available: false,
    content_rating: "safe",
    supported: true,
    offers: [],
    sources: [],
    enabled_langs: [],
    ...over,
  });

  it("filters by name, a source's name, language and state", () => {
    const list = [
      pkg({ id: "a", name: "Alpha", sources: [{ id: "s", name: "Beta Site", lang: "ja", available: true }] }),
      pkg({ id: "b", name: "Gamma", installed: true, update_available: true, langs: ["fr"] }),
    ];
    expect(filterPackages(list, { q: "beta" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterPackages(list, { lang: "ja" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterPackages(list, { show: "updates" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("lists updates first, then installed, then the rest, each by name, under every filter", () => {
    const list = [
      pkg({ id: "a", name: "Alpha" }),
      pkg({ id: "z", name: "Zeta", installed: true }),
      pkg({ id: "m", name: "Mu", installed: true, update_available: true }),
      pkg({ id: "b", name: "Beta", installed: true }),
      pkg({ id: "c", name: "Alpha" }),
      pkg({ id: "y", name: "Ypsilon", installed: true, update_available: true }),
    ];
    expect(filterPackages(list, {}).map((p) => p.id)).toEqual(["m", "y", "b", "z", "a", "c"]);
    expect(filterPackages(list, { show: "installed" }).map((p) => p.id)).toEqual(["m", "y", "b", "z"]);
    expect(filterPackages(list, { show: "updates" }).map((p) => p.id)).toEqual(["m", "y"]);
    expect(filterPackages(list, { q: "a" }).map((p) => p.id)).toEqual(["b", "z", "a", "c"]);
    // The input is left as it was.
    expect(list.map((p) => p.id)).toEqual(["a", "z", "m", "b", "c", "y"]);
  });

  it("lists languages with all and multi last, and labels versions", () => {
    expect(packageLanguages([pkg({ langs: ["multi", "ja"] }), pkg({ langs: ["all", "en"] })])).toEqual([
      "en",
      "ja",
      "all",
      "multi",
    ]);
    expect(
      versionLabel(pkg({ installed: true, installed_version: "1.0.0", version: "1.1.0", update_available: true })),
    ).toBe("v1.0.0 → v1.1.0");
    expect(versionLabel(pkg({ version: "dev" }))).toBe("dev");
  });
});
