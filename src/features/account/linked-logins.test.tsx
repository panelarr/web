// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "@/auth/sso";
import { db, resetDb } from "@/mocks/db";
import { ssoUser } from "@/mocks/oidc";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

afterEach(() => vi.restoreAllMocks());

const card = () => screen.getByRole("heading", { name: "Linked logins" }).closest("[data-slot=card]") as HTMLElement;

describe("linked logins on the account page", () => {
  it("aren't there without single sign-on", async () => {
    await renderApp("/settings?tab=security");
    await screen.findByRole("heading", { name: "Sessions" });
    expect(screen.queryByRole("heading", { name: "Linked logins" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link SSO login" })).not.toBeInTheDocument();
  });

  it("link a login with a CSRF-checked POST, then go to the provider", async () => {
    resetDb("sso");
    const assign = vi.spyOn(browser, "assign").mockImplementation(() => {});
    const sent: { csrf: string | null; body: unknown }[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/auth/oidc/link")) {
        sent.push({ csrf: request.headers.get("X-CSRF-Token"), body: await request.clone().json() });
      }
    });
    await renderApp("/settings?tab=security");
    expect(await within(await waitFor(card)).findByText("No login is linked yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Link SSO login" }));

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([{ csrf: "mock-csrf-token", body: { return_to: "/settings?tab=security&sso=linked" } }]);
    const target = new URL(assign.mock.calls[0]?.[0] ?? "");
    expect(target.pathname).toBe("/mock-provider/authorize");
    expect(target.searchParams.get("intent")).toBe("link");
  });

  it("say why linking failed when the provider sends the browser back", async () => {
    resetDb("sso");
    const { router } = await renderApp("/settings?tab=security&sso_error=already_linked");
    expect(await screen.findByText("That login is already linked to another Panelarr account.")).toBeInTheDocument();
    // The code leaves the address; the message stays.
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "security" }));
    expect(screen.getByText("That login is already linked to another Panelarr account.")).toBeInTheDocument();
  });

  it.each([
    ["csrf_failed", "Linking couldn't be confirmed as started here. Use Link SSO login on this page."],
    ["cross_site", "Linking was started from another site, so it was refused. Use Link SSO login on this page."],
    ["unauthenticated", "Sign in first, then link your login."],
    ["session_required", "Linking a login needs you signed in here, not an API key."],
  ])("say why a refused link start (%s) didn't link", async (code, message) => {
    resetDb("sso");
    // The server sends a refused link start back to its return_to, as it does a failed callback.
    const { router } = await renderApp(`/settings?tab=security&sso=linked&sso_error=${code}`);
    expect(await within(await waitFor(card)).findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Not linked")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "security" }));
    expect(screen.queryByText("Single sign-on login linked.")).not.toBeInTheDocument();
  });

  it("list the login, and unlink it when there's a password left", async () => {
    resetDb("sso");
    db().currentUserId = db().users.find((u) => u.username === "reader")?.id;
    await renderApp("/settings?tab=security");
    const rows = await within(await waitFor(card)).findByRole("list", { name: "Linked logins" });
    expect(within(rows).getByText("id.example.com")).toBeInTheDocument();
    expect(within(rows).getByText(/reader@example\.com · linked .* · last used/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link SSO login" })).not.toBeInTheDocument();

    await userEvent.click(within(rows).getByRole("button", { name: "Unlink" }));
    expect(await within(card()).findByText("No login is linked yet.")).toBeInTheDocument();
    expect(db().identities.some((i) => i.subject === "example-reader")).toBe(false);
  });

  it("refuse to unlink the only way in, until a first password is set", async () => {
    resetDb("sso");
    db().currentUserId = ssoUser.id;
    await renderApp("/settings?tab=security");
    const rows = await within(await waitFor(card)).findByRole("list", { name: "Linked logins" });
    await userEvent.click(within(rows).getByRole("button", { name: "Unlink" }));
    expect(
      await screen.findByText("This is your only way to sign in. Set a password first, then unlink it."),
    ).toBeInTheDocument();

    // No current password to give: this is the first one.
    expect(screen.getByText(/have no password yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New password"), "a-first-password");
    await userEvent.type(screen.getByLabelText("Repeat the new password"), "a-first-password");
    await userEvent.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(db().passwords.casey).toBe("a-first-password"));
    expect(await screen.findByLabelText("Current password")).toBeInTheDocument();

    await userEvent.click(within(card()).getByRole("button", { name: "Unlink" }));
    expect(await within(card()).findByText("No login is linked yet.")).toBeInTheDocument();
  });
});
