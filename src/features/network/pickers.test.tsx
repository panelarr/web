// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { renderApp } from "@/test/render";

const assignment = (kind: string, id = "") =>
  db().assignments.find((a) => a.target_kind === kind && a.target_id === id);
const sourceRow = (name: string) =>
  within(screen.getByRole("region", { name: "Sources" }))
    .getByText(name)
    .closest("li") as HTMLElement;

describe("choosing network profiles", () => {
  it("on a plugin, inherited by its sources unless one has its own", async () => {
    await renderApp("/admin/plugins/example?tab=network");
    const plugin = await screen.findByLabelText("Network profile for Example Source Plugin");
    await waitFor(() => expect(within(plugin).getByRole("option", { name: "Through the VPN" })).toBeInTheDocument());
    await userEvent.selectOptions(plugin, "profile:vpn");
    await waitFor(() => expect(assignment("plugin", "example")).toMatchObject({ profile_id: "vpn" }));
    expect(
      await within(sourceRow("Example Source")).findByText(/In effect: Through the VPN \(from its plugin\)\./),
    ).toBeInTheDocument();
    // On its way, then in use.
    expect(await within(sourceRow("Example Source")).findByText(/On its way|In use/)).toBeInTheDocument();

    // One source goes its own way.
    await userEvent.selectOptions(
      within(sourceRow("Sample Scans")).getByLabelText("Network profile for Sample Scans"),
      "plugin_default",
    );
    await waitFor(() => expect(assignment("source", "example:1002")).toMatchObject({ plugin_default: true }));
    expect(
      await within(sourceRow("Sample Scans")).findByText(/Its own settings \(chosen on this source\)\./),
    ).toBeInTheDocument();
  });

  it("makes a custom profile in place, for that source only, and uses it", async () => {
    await renderApp("/admin/plugins/example?tab=network");
    await userEvent.click(await screen.findByRole("button", { name: "New custom profile for Example Source" }));
    const dialog = await screen.findByRole("dialog", { name: "New custom profile" });
    expect(within(dialog).getByText(/Only for this one/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("ID"), "only-here");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Just for this source");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(assignment("source", "example:1001")).toMatchObject({ profile_id: "only-here" }));
    expect(db().profiles.find((p) => p.id === "only-here")?.owner).toEqual({ kind: "source", id: "example:1001" });
    const row = sourceRow("Example Source");
    expect(await within(row).findByText(/Just for this source \(from this source\)/)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit Just for this source" })).toBeInTheDocument();
    // Not offered elsewhere.
    expect(
      within(sourceRow("Sample Scans")).queryByRole("option", { name: "Just for this source" }),
    ).not.toBeInTheDocument();
  });

  it("on an extension, from its details, for its sources", async () => {
    await renderApp("/admin/plugins/stores?tab=extensions&q=Polyglot&pkg=org.example.polyglot");
    const sheet = await screen.findByRole("dialog");
    const picker = await within(sheet).findByLabelText("Network profile for this extension");
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Through the VPN" })).toBeInTheDocument());
    await userEvent.selectOptions(picker, "profile:vpn");
    await waitFor(() =>
      expect(assignment("package", "stores:org.example.polyglot")).toMatchObject({ profile_id: "vpn" }),
    );
    // This plugin can't use a solver: said where it matters.
    expect(await within(sheet).findByText(/can't use a solver/)).toBeInTheDocument();
  });

  it("for the metadata service and each provider, on its own page", async () => {
    await renderApp("/admin/metadata?tab=network");
    const all = await screen.findByLabelText("Network profile for every provider");
    await waitFor(() => expect(within(all).getByRole("option", { name: "Through the VPN" })).toBeInTheDocument());
    await userEvent.selectOptions(all, "profile:vpn");
    await waitFor(() => expect(assignment("meta")).toMatchObject({ profile_id: "vpn" }));
    const providers = screen.getByRole("list", { name: "Providers" });
    expect(
      await within(providers).findByText(/In effect: Through the VPN \(from the metadata service\)\./),
    ).toBeInTheDocument();
    expect(within(providers).getByText(/It uses: Through the VPN\./)).toBeInTheDocument();
  });

  it("keeps a plugin's own proxy to it, its extensions and its sources", async () => {
    await renderApp("/admin/plugins/example?tab=network");
    const own = await screen.findByRole("region", { name: "Only for this plugin" });
    await userEvent.click(within(own).getByRole("button", { name: "Add a proxy" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a proxy" });
    await userEvent.type(within(dialog).getByLabelText("ID"), "example-own");
    await userEvent.type(within(dialog).getByLabelText("Name"), "The plugin's own proxy");
    await userEvent.type(within(dialog).getByLabelText("URL"), "http://own-proxy:3128");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(own).findByText("The plugin's own proxy")).toBeInTheDocument();
    expect(db().proxies.find((p) => p.id === "example-own")?.owner).toEqual({ kind: "plugin", id: "example" });

    // A source's custom profile may use it.
    await userEvent.click(screen.getByRole("button", { name: "New custom profile for Example Source" }));
    const profile = await screen.findByRole("dialog", { name: "New custom profile" });
    expect(within(profile).getByRole("option", { name: "The plugin's own proxy (custom)" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  });

  it("offers a plugin's own solvers only when it can use one", async () => {
    await renderApp("/admin/plugins/stores?tab=network");
    const own = await screen.findByRole("region", { name: "Only for this plugin" });
    expect(within(own).getByRole("region", { name: "Proxies" })).toBeInTheDocument();
    expect(within(own).queryByRole("region", { name: "Solvers" })).not.toBeInTheDocument();
  });
});
