// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { ssoUser } from "@/mocks/oidc";
import { renderApp } from "@/test/render";

const reader = () => db().users.find((u) => u.username === "reader");
const linkedCard = () =>
  screen.getByRole("heading", { name: "Linked logins" }).closest("[data-slot=card]") as HTMLElement;

describe("single sign-on in the admin area", () => {
  it("adds nothing when it's off", async () => {
    await renderApp("/admin/users");
    await screen.findByText("reader");
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "admin");
    expect(within(dialog).queryByText(/identity provider/)).not.toBeInTheDocument();
  });

  it("adds nothing to a user's page or Health when it's off", async () => {
    await renderApp(`/admin/users/${reader()?.id}`);
    await screen.findByRole("heading", { name: "Permissions" });
    expect(screen.queryByRole("heading", { name: "Linked logins" })).not.toBeInTheDocument();

    await renderApp("/admin/health");
    await screen.findByRole("heading", { name: "Server" });
    expect(screen.queryByRole("heading", { name: /Single sign-on/ })).not.toBeInTheDocument();
  });

  it("marks linked users", async () => {
    resetDb("sso");
    await renderApp("/admin/users");
    const list = (await screen.findByText("reader")).closest("ul") as HTMLElement;
    const row = (name: string) => within(list).getByText(name).closest("li") as HTMLElement;
    await waitFor(() => expect(within(row("reader")).getByText("SSO")).toBeInTheDocument());
    expect(within(row("Casey")).getByText("SSO")).toBeInTheDocument();
    expect(within(row("admin")).queryByText("SSO")).not.toBeInTheDocument();
  });

  it("lists a user's logins and unlinks one", async () => {
    resetDb("sso");
    await renderApp(`/admin/users/${reader()?.id}`);
    const rows = await within(await waitFor(linkedCard)).findByRole("list", { name: "Linked logins" });
    expect(within(rows).getByText(/reader@example\.com/)).toBeInTheDocument();
    await userEvent.click(within(rows).getByRole("button", { name: "Unlink" }));
    expect(await within(linkedCard()).findByText(/No login is linked/)).toBeInTheDocument();
    expect(db().identities.some((i) => i.user_id === reader()?.id)).toBe(false);
  });

  it("explains why a user's only way in can't be unlinked, and offers a first password", async () => {
    resetDb("sso");
    await renderApp(`/admin/users/${ssoUser.id}`);
    expect(await screen.findByRole("heading", { name: "Set a password" })).toBeInTheDocument();
    const rows = await within(await waitFor(linkedCard)).findByRole("list", { name: "Linked logins" });
    await userEvent.click(within(rows).getByRole("button", { name: "Unlink" }));
    expect(
      await screen.findByText("This is their only way to sign in. Set a password for them first, or disable the user."),
    ).toBeInTheDocument();
  });

  it("shows how single sign-on is configured on Health", async () => {
    resetDb("sso");
    await renderApp("/admin/health");
    const heading = await screen.findByRole("heading", { name: /Single sign-on/ });
    const card = heading.closest("[data-slot=card]") as HTMLElement;
    const settings = card.querySelector("dl") as HTMLElement;
    expect(within(settings).getByText("https://id.example.com")).toBeInTheDocument();
    expect(within(settings).getByText("panelarr-admins")).toBeInTheDocument();
    expect(within(settings).getByText("Here and at the provider")).toBeInTheDocument();
    expect(within(card).getByText("Healthy")).toBeInTheDocument();
  });

  it("warns that an admin invite follows the provider's admin groups", async () => {
    resetDb("sso");
    await renderApp("/admin/users");
    await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/identity provider manages the admin role/)).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "admin");
    expect(await within(dialog).findByText("The identity provider manages the admin role")).toBeInTheDocument();
    expect(within(dialog).getByText(/members of panelarr-admins admins.*they become a user/)).toBeInTheDocument();
  });
});
