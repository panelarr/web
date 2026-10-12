// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { mockUrl, problem } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const reader = () => db().users.find((u) => u.username === "reader");
const pluginCard = (name: string) => screen.getByText(name).closest("[data-slot=card]") as HTMLElement;

describe("the admin area", () => {
  it("is for admins only", async () => {
    resetDb("user");
    const { router } = await renderApp("/admin/users");
    await screen.findByRole("heading", { name: "Library" });
    expect(router.state.location.pathname).toBe("/");
  });

  it("opens on Users, with one section marked current", async () => {
    const { router } = await renderApp("/admin");
    await screen.findByRole("heading", { name: "Users" });
    expect(router.state.location.pathname).toBe("/admin/users");
    const nav = screen.getByRole("navigation", { name: "Admin" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("data-status") === "active");
    expect(current.map((link) => link.textContent)).toEqual(["Users"]);
  });
});

describe("users", () => {
  it("lists users with what they may do", async () => {
    await renderApp("/admin/users");
    expect(await screen.findByText(/May do everything/)).toBeInTheDocument();
    expect(screen.getByText(/adds works · no downloads · up to suggestive · 1 sources/)).toBeInTheDocument();
  });

  it("adds a user with chosen permissions", async () => {
    await renderApp("/admin/users");
    await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Username"), "sam");
    await userEvent.type(within(dialog).getByLabelText("Password"), "a-good-password");
    await userEvent.type(within(dialog).getByLabelText("Repeat the password"), "a-good-password");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Download chapters" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Content up to"), "erotic");
    await userEvent.click(within(dialog).getByRole("switch", { name: "All sources" }));
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Example Source/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add user" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(db().users.find((u) => u.username === "sam")?.grants).toEqual({
      may_add: true,
      may_download: true,
      may_manage_matches: false,
      content_rating_ceiling: "erotic",
      all_sources: false,
      allowed_sources: ["example:1001"],
    });
    expect(await screen.findByText("sam")).toBeInTheDocument();
  });

  it("explains a taken username", async () => {
    await renderApp("/admin/users");
    await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Username"), "Reader");
    await userEvent.type(within(dialog).getByLabelText("Password"), "a-good-password");
    await userEvent.type(within(dialog).getByLabelText("Repeat the password"), "a-good-password");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(await within(dialog).findByText('"Reader" is taken.')).toBeInTheDocument();
  });

  it("creates an invite link with the token in the fragment, shown once", async () => {
    await renderApp("/admin/users");
    await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Note"), "For Alex");
    await userEvent.selectOptions(within(dialog).getByLabelText("Valid for"), "168");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invite link" }));

    const link = (await within(dialog).findByLabelText("Invite link")) as HTMLInputElement;
    expect(link.value).toMatch(/^http:\/\/localhost:3000\/invite#token=[0-9a-f]+$/);
    expect(db().invites[0]?.token).toBe(link.value.split("token=")[1]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(await screen.findByText("For Alex")).toBeInTheDocument();
  });

  it("revokes an open invite", async () => {
    await renderApp("/admin/users");
    const invites = await screen.findByRole("region", { name: "Open invites" });
    await userEvent.click(within(invites).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("For Sam")).not.toBeInTheDocument());
    expect(db().invites).toHaveLength(0);
  });
});

describe("a user's page", () => {
  it("changes permissions, sending only what changed", async () => {
    await renderApp(`/admin/users/${reader()?.id}`);
    await userEvent.click(await screen.findByRole("switch", { name: "Fix matches" }));
    await userEvent.click(screen.getByRole("button", { name: "Save permissions" }));
    await waitFor(() => expect(reader()?.grants.may_manage_matches).toBe(true));
    expect(reader()?.grants.allowed_sources).toEqual(["example:1001"]);
  });

  it("disables a user", async () => {
    await renderApp(`/admin/users/${reader()?.id}`);
    await userEvent.click(await screen.findByRole("switch", { name: "Disabled" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(reader()?.disabled).toBe(true));
  });

  it("doesn't let admins demote, disable or delete themselves", async () => {
    await renderApp(`/admin/users/${db().users[0]?.id}`);
    expect(await screen.findByRole("switch", { name: "Disabled" })).toBeDisabled();
    expect(screen.getByLabelText("Role")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("resets a password", async () => {
    await renderApp(`/admin/users/${reader()?.id}`);
    await userEvent.type(await screen.findByLabelText("New password"), "fresh-password");
    await userEvent.type(screen.getByLabelText("Repeat the password"), "fresh-password");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(db().passwords.reader).toBe("fresh-password"));
  });

  it("deletes a user after confirming", async () => {
    const { router } = await renderApp(`/admin/users/${reader()?.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/users"));
    expect(reader()).toBeUndefined();
  });
});

describe("plugins", () => {
  it("turns a plugin off and syncs it", async () => {
    await renderApp("/admin/plugins");
    await userEvent.click(await screen.findByRole("switch", { name: "Example Source Plugin enabled" }));
    await waitFor(() => expect(db().plugins[0]?.enabled).toBe(false));
    await userEvent.click(within(pluginCard("Example Source Plugin")).getByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("Example Source Plugin: 3 sources, ok.")).toBeInTheDocument();
  });

  it("saves settings from the plugin's own schema, showing its field errors", async () => {
    await renderApp("/admin/plugins/example");
    const url = await screen.findByLabelText("Service URL");
    await userEvent.clear(url);
    await userEvent.type(url, "ftp://nope");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("must be an http(s) URL")).toBeInTheDocument();

    await userEvent.clear(url);
    await userEvent.type(url, "http://backend:9090");
    await userEvent.click(screen.getByRole("checkbox", { name: "ja" }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(db().pluginConfigs.example?.values.base_url).toBe("http://backend:9090"));
    expect(db().pluginConfigs.example?.values.languages).toEqual(["en", "ja"]);
  });

  it("adds an extension store in the plugin's settings", async () => {
    await renderApp("/admin/plugins/example");
    const stores = await screen.findByRole("group", { name: "Extension stores" });
    await userEvent.click(within(stores).getByRole("button", { name: "Add store" }));
    await userEvent.type(
      within(stores).getAllByLabelText("Store URL")[1] as HTMLElement,
      "https://new.example.net/index.json",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(db().pluginConfigs.example?.values.stores).toEqual([
        { url: "https://store.example.com/index.json" },
        { url: "https://new.example.net/index.json" },
      ]),
    );
  });

  it("shows on the plugin's page how applying its settings went", async () => {
    await renderApp("/admin/plugins/example");
    const stores = await screen.findByRole("group", { name: "Extension stores" });
    await userEvent.click(within(stores).getByRole("button", { name: "Add store" }));
    await userEvent.type(
      within(stores).getAllByLabelText("Store URL")[1] as HTMLElement,
      "https://unreachable.example.net/index.json",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/its health here updates when it's done/)).toBeInTheDocument();
    // The server checks the plugin after the save and says so on the event stream: no Sync now.
    expect(
      await screen.findByText("adding store https://unreachable.example.net/index.json: can't be reached"),
    ).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows a development build's version as it is, not as vdev", async () => {
    for (const plugin of db().plugins) plugin.version = "dev";
    const { router } = await renderApp("/admin/plugins");
    expect((await screen.findAllByText("dev")).length).toBe(2);
    await router.navigate({ to: "/admin/plugins/$pluginId", params: { pluginId: "example" } });
    expect(await screen.findByText(/example · dev/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/vdev/);
  });

  it("removes a plugin and its sources", async () => {
    await renderApp("/admin/plugins");
    await screen.findByText("Example Source Plugin");
    await userEvent.click(within(pluginCard("Example Source Plugin")).getByRole("button", { name: "Remove" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("Example Source Plugin")).not.toBeInTheDocument());
    expect(db().sources.filter((source) => source.plugin_id === "example")).toHaveLength(0);
  });
});

describe("sources", () => {
  it("filters from the URL and turns a source off", async () => {
    await renderApp("/admin/sources?status=failing");
    expect(await screen.findByText("Sample Scans")).toBeInTheDocument();
    expect(screen.queryByText("Example Source")).not.toBeInTheDocument();
    expect(screen.getByText("The site answered 503 for the last 3 checks.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Sample Scans on" }));
    await waitFor(() => expect(db().sources.find((s) => s.id === "example:1002")?.enabled).toBe(false));
  });

  it("searches by name", async () => {
    const { router } = await renderApp("/admin/sources");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search sources" }), "demo");
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "demo" }));
    expect(screen.getByText("Demo Comics")).toBeInTheDocument();
    expect(screen.queryByText("Sample Scans")).not.toBeInTheDocument();
  });
});

describe("system", () => {
  it("shows component health and the metadata connection", async () => {
    await renderApp("/admin/system");
    expect(await screen.findByText("database")).toBeInTheDocument();
    expect(screen.getByText("A metadata provider has entries")).toBeInTheDocument();
  });
  it("says why a provider's sync didn't start, in the server's words", async () => {
    resetDb("degraded");
    server.use(
      http.post(mockUrl("/system/meta/providers/{provider}/sync"), () =>
        problem(
          502,
          "meta_provider_unavailable",
          "Metadata provider unavailable",
          "The metadata service can't reach the example-provider plugin. Start it and try again.",
        ),
      ),
    );
    await renderApp("/admin/system");
    await userEvent.click(await screen.findByRole("button", { name: "Start sync" }));
    expect(await screen.findByText("The sync didn't start")).toBeInTheDocument();
    expect(screen.getByText(/can't reach the example-provider plugin/)).toBeInTheDocument();
  });
});
