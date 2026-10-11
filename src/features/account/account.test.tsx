// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { renderApp } from "@/test/render";

describe("settings", () => {
  it("selects exactly one tab, from the URL", async () => {
    const { router } = await renderApp("/settings?tab=security");
    await screen.findByRole("heading", { name: "Password" });
    const tablist = screen.getByRole("tablist");
    const selected = within(tablist)
      .getAllByRole("tab")
      .filter((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected.map((tab) => tab.textContent)).toEqual(["Security"]);

    await userEvent.click(within(tablist).getByRole("tab", { name: "API keys" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "api-keys" }));
    expect(within(tablist).getAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("saves the display name", async () => {
    await renderApp("/settings");
    const field = await screen.findByLabelText("Display name");
    await userEvent.clear(field);
    await userEvent.type(field, "The Owner");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db().users[0]?.display_name).toBe("The Owner"));
  });

  it("changes the password, checking the current one", async () => {
    await renderApp("/settings?tab=security");
    await userEvent.type(await screen.findByLabelText("Current password"), "not-it");
    await userEvent.type(screen.getByLabelText("New password"), "another-password");
    await userEvent.type(screen.getByLabelText("Repeat the new password"), "another-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The current password is wrong.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Current password"));
    await userEvent.type(screen.getByLabelText("Current password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(db().passwords.admin).toBe("another-password"));
  });

  it("signs out another session", async () => {
    await renderApp("/settings?tab=security");
    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument());
    expect(db().sessions).toHaveLength(1);
  });
});

describe("API keys", () => {
  it("shows a new key once", async () => {
    await renderApp("/settings?tab=api-keys");
    await userEvent.click(await screen.findByRole("button", { name: "New key" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Script");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Write" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    const key = await within(dialog).findByLabelText("API key");
    expect((key as HTMLInputElement).value).toMatch(/^pnl_/);
    expect(db().apiKeys[0]).toMatchObject({ name: "Script", scopes: ["read", "write"] });

    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Opening the dialog again doesn't show the old key.
    await userEvent.click(screen.getByRole("button", { name: "New key" }));
    expect(within(await screen.findByRole("dialog")).queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("offers admin scopes to admins only", async () => {
    resetDb("user");
    await renderApp("/settings?tab=api-keys");
    await userEvent.click(await screen.findByRole("button", { name: "New key" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Read" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("revokes a key after confirming", async () => {
    await renderApp("/settings?tab=api-keys");
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("Tablet app")).not.toBeInTheDocument());
    expect(db().apiKeys).toHaveLength(0);
  });
});

describe("the health banner", () => {
  it("tells admins when Panelarr is degraded", async () => {
    resetDb("degraded");
    await renderApp("/");
    expect(await screen.findByText("Panelarr is running degraded")).toBeInTheDocument();
    expect(screen.getByText(/No provider has entries yet/)).toBeInTheDocument();
  });
});
