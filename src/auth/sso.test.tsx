// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invite } from "@/mocks/data";
import { db, resetDb } from "@/mocks/db";
import { renderApp } from "@/test/render";
import { browser, ssoErrorMessage, ssoErrorParam } from "./sso";

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

const ssoLink = () => screen.queryByRole("link", { name: "Sign in with Example ID" });

describe("the login page", () => {
  it("is unchanged without single sign-on", async () => {
    resetDb("signed-out");
    await renderApp("/login");
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(ssoLink()).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /SSO|single sign-on/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^or$/)).not.toBeInTheDocument();
  });

  it("puts the SSO button above the password form, coming back where the visitor was going", async () => {
    resetDb("sso-signed-out");
    await renderApp("/downloads");
    const button = await screen.findByRole("link", { name: "Sign in with Example ID" });
    const url = new URL(button.getAttribute("href") ?? "");
    expect(url.pathname).toBe("/api/v1/auth/oidc/start");
    expect(url.searchParams.get("return_to")).toBe("/downloads");
    const username = screen.getByLabelText("Username");
    // The button comes first in the page.
    expect(button.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Password sign-in is for admins/)).not.toBeInTheDocument();
  });

  it("hides the password form behind Use a password when passwords are for admins", async () => {
    resetDb("sso-admins");
    const { router } = await renderApp("/login");
    expect(await screen.findByRole("link", { name: "Sign in with Example ID" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Use a password" }));
    expect(screen.getByText(/Password sign-in is for admins/)).toBeInTheDocument();
    // A user's right password is refused like a wrong one.
    await userEvent.type(screen.getByLabelText("Username"), "reader");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong username or password.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it.each([
    ["not_linked", "No Panelarr account is linked to this login; ask an admin for an invite."],
    ["account_disabled", "Your Panelarr account is disabled. Ask an admin."],
    ["state_mismatch", "The answer from the identity provider didn't belong to this sign-in. Try again."],
    ["oidc_unavailable", "The identity provider can't be reached right now. Try again later."],
    ["some_new_code", "Signing in with SSO didn't work. Try again."],
  ])("explains the callback's %s", async (code, message) => {
    resetDb("sso-signed-out");
    await renderApp(`/login?sso_error=${code}`);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(code)).not.toBeInTheDocument();
    const again = screen.getByRole("link", { name: "Try again" });
    expect(again.getAttribute("href")).toContain("/api/v1/auth/oidc/start?");
  });

  it("never renders a made-up code as markup", async () => {
    resetDb("sso-admins");
    const { container, router } = await renderApp(`/login?sso_error=${encodeURIComponent('<img src=x id="evil">')}`);
    expect(await screen.findByText("Signing in with SSO didn't work. Try again.")).toBeInTheDocument();
    expect(container.querySelector("#evil")).toBeNull();
    expect(screen.queryByText(/<img/)).not.toBeInTheDocument();

    // Use a password leaves the error behind and shows the form.
    await userEvent.click(screen.getByRole("button", { name: "Use a password" }));
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByText("Signing in with SSO didn't work. Try again.")).not.toBeInTheDocument();
  });

  it("knows codes only as its own keys", () => {
    expect(ssoErrorMessage("constructor")).toBe("Signing in with SSO didn't work. Try again.");
    expect(ssoErrorMessage("__proto__")).toBe("Signing in with SSO didn't work. Try again.");
    expect(ssoErrorParam("not_linked")).toBe("not_linked");
    expect(ssoErrorParam("<b>")).toBe("unknown");
    expect(ssoErrorParam(undefined)).toBeUndefined();
  });
});

describe("invites with single sign-on", () => {
  it("offer Accept with SSO next to choosing a password", async () => {
    resetDb("sso-signed-out");
    db().invites.push({ ...invite, token: "sso-invite-token" });
    window.location.hash = "#token=sso-invite-token";
    await renderApp("/invite");
    const accept = await screen.findByRole("link", { name: "Accept with SSO" });
    const url = new URL(accept.getAttribute("href") ?? "");
    expect(url.pathname).toBe("/api/v1/auth/oidc/start");
    expect(url.searchParams.get("invite")).toBe("sso-invite-token");
    expect(url.searchParams.get("return_to")).toBe("/");
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("don't without it", async () => {
    resetDb("signed-out");
    db().invites.push({ ...invite, token: "plain-invite-token" });
    window.location.hash = "#token=plain-invite-token";
    await renderApp("/invite");
    expect(await screen.findByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Accept with SSO" })).not.toBeInTheDocument();
  });
});

describe("signing out", () => {
  it("finishes at the identity provider after single sign-on, when the server says so", async () => {
    resetDb("sso");
    db().sessionMethod = "oidc";
    const assign = vi.spyOn(browser, "assign").mockImplementation(() => {});
    await renderApp("/more");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const target = new URL(assign.mock.calls[0]?.[0] ?? "");
    expect(target.pathname).toBe("/mock-provider/end-session");
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3000/login");
    expect(db().currentUserId).toBeUndefined();
  });

  it("goes to the sign-in page when the server answers 204", async () => {
    resetDb("sso"); // signed in with a password: Panelarr's session only
    const assign = vi.spyOn(browser, "assign").mockImplementation(() => {});
    const { router } = await renderApp("/more");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(assign).not.toHaveBeenCalled();
  });
});
