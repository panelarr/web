// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { renderApp } from "@/test/render";

/** A listed item's row (names also show as options in pickers). */
const row = (name: string) =>
  screen
    .getAllByText(name)
    .find((el) => el.closest("li"))
    ?.closest("li") as HTMLElement;

describe("Admin → Network", () => {
  it("lists profiles with what they do and where they're used, and sets the one for everything", async () => {
    await renderApp("/admin/network");
    const vpn = await waitFor(() => row("Through the VPN"));
    expect(vpn).toHaveTextContent(/via VPN \(Netherlands\) · solver Challenge solver · 30 per 60s · 4 at once/);
    expect(vpn).toHaveTextContent("Not assigned.");

    await userEvent.selectOptions(screen.getByLabelText("For everything"), "vpn");
    await waitFor(() =>
      expect(db().assignments).toEqual([expect.objectContaining({ target_kind: "global", profile_id: "vpn" })]),
    );
    expect(await within(row("Through the VPN")).findByText(/Used for everything\./)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("For everything"), "");
    await waitFor(() => expect(db().assignments).toEqual([]));
  });

  it("adds a solver after testing it, and says when one doesn't answer", async () => {
    await renderApp("/admin/network?tab=solvers");
    await userEvent.click(await screen.findByRole("button", { name: "Add a solver" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("ID"), "backup");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Backup solver");
    await userEvent.type(within(dialog).getByLabelText("URL"), "http://down-solver:8191");
    await userEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(await within(dialog).findByText(/didn't answer/)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText("URL"));
    await userEvent.type(within(dialog).getByLabelText("URL"), "http://backup-solver:8191");
    await userEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(await within(dialog).findByText(/The solver answered\. \(\d+ ms, version 3\.3\.21\)/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Backup solver")).toBeInTheDocument();
    expect(db().solvers.find((s) => s.id === "backup")).toMatchObject({ url: "http://backup-solver:8191" });
  });

  it("keeps a proxy's password unless replaced, and drops the credentials with the user", async () => {
    await renderApp("/admin/network?tab=proxies");
    const home = await waitFor(() => row("Home SOCKS"));
    expect(home).toHaveTextContent("user reader · password set");
    await userEvent.click(within(home).getByRole("button", { name: "Edit" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Password")).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db().proxyPasswords["socks-home"]).toBe("secret"));

    await userEvent.click(within(row("Home SOCKS")).getByRole("button", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("User"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db().proxies.find((p) => p.id === "socks-home")?.has_password).toBe(false));
    expect(db().proxyPasswords["socks-home"]).toBeUndefined();
  });

  it("builds a profile: a proxy, a speed limit, a fixed browser and headers", async () => {
    await renderApp("/admin/network");
    await userEvent.click(await screen.findByRole("button", { name: "Add a profile" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("ID"), "slow");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Slow and steady");
    await userEvent.selectOptions(within(dialog).getByLabelText("Proxy"), "socks-home");
    // The solver's browser needs a solver.
    expect(within(dialog).getByRole("option", { name: /The solver's/ })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("switch", { name: "Rate limit" }));
    await userEvent.clear(within(dialog).getByLabelText("Requests"));
    await userEvent.type(within(dialog).getByLabelText("Requests"), "10");
    await userEvent.selectOptions(within(dialog).getByLabelText("Browser (user agent)"), "fixed");
    await userEvent.type(within(dialog).getByLabelText("User agent"), "ExampleBrowser/1.0");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add a header" }));
    await userEvent.type(within(dialog).getByLabelText("Header 1 name"), "Referer");
    await userEvent.type(within(dialog).getByLabelText("Header 1 value"), "https://example.com/");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(row("Slow and steady")).toBeInTheDocument());
    expect(db().profiles.find((p) => p.id === "slow")).toMatchObject({
      proxy_id: "socks-home",
      rate_limit: { requests: 10, period_seconds: 60, scope: "source" },
      user_agent: { mode: "fixed", value: "ExampleBrowser/1.0" },
      headers: { Referer: "https://example.com/" },
    });
  });

  it("won't delete what a profile uses, saying which", async () => {
    await renderApp("/admin/network?tab=proxies");
    await userEvent.click(
      within(await waitFor(() => row("VPN (Netherlands)"))).getByRole("button", { name: "Delete" }),
    );
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Used by Through the VPN/)).toBeInTheDocument();
    expect(db().proxies.some((p) => p.id === "vpn-nl")).toBe(true);
  });

  it("shows custom ones only when asked", async () => {
    db().proxies.push({
      id: "plugin-own",
      name: "The plugin's own proxy",
      url: "http://own:8080",
      has_password: false,
      owner: { kind: "plugin", id: "stores" },
      created_at: "2026-10-10T09:00:00Z",
      updated_at: "2026-10-10T09:00:00Z",
    });
    const { router } = await renderApp("/admin/network?tab=proxies");
    await screen.findByText("Home SOCKS");
    expect(screen.queryByText("The plugin's own proxy")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Show custom ones too" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ custom: true }));
    expect(await screen.findByText("The plugin's own proxy")).toBeInTheDocument();
    expect(row("The plugin's own proxy")).toHaveTextContent("Custom: plugin stores");
  });
});
