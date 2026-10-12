// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { invite } from "@/mocks/data";
import { db, resetDb } from "@/mocks/db";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

describe("asking who the user is", () => {
  function countMe() {
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname.endsWith("/api/v1/me")) seen.push(request.method);
    });
    return seen;
  }

  it("doesn't, for a visitor without a session (no failed requests)", async () => {
    resetDb("signed-out");
    const seen = countMe();
    await renderApp("/downloads");
    expect(await screen.findByRole("heading", { name: "Sign in to Panelarr" })).toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it("doesn't, on a new install", async () => {
    resetDb("fresh");
    const seen = countMe();
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();
    expect(seen).toEqual([]);
  });
});

describe("signing in", () => {
  it("sends visitors to sign in and back where they were going", async () => {
    resetDb("signed-out");
    const { router } = await renderApp("/downloads");
    expect(await screen.findByRole("heading", { name: "Sign in to Panelarr" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ redirect: "/downloads" });

    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: /^Downloads$/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/downloads");
  });

  it("says when the password is wrong, then when there were too many tries", async () => {
    resetDb("signed-out");
    await renderApp("/login");
    const username = await screen.findByLabelText("Username");
    await userEvent.type(username, "admin");
    await userEvent.type(screen.getByLabelText("Password"), "nope-nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong username or password.")).toBeInTheDocument();

    db().failedLogins = 5;
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Too many attempts. Try again in 30 seconds/)).toBeInTheDocument();
  });

  it("goes to sign-in, saying why, when the session ends mid-use", async () => {
    const { router } = await renderApp("/settings?tab=profile");
    await screen.findByRole("heading", { name: "Settings" });
    db().currentUserId = undefined; // the server ended the session
    await userEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(await screen.findByText("Your session ended. Sign in again to continue.")).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ expired: true });
  });

  it("signs out", async () => {
    const { router } = await renderApp("/more");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(db().currentUserId).toBeUndefined();
  });

  it("hides admin pages from users", async () => {
    resetDb("user");
    await renderApp("/more");
    const main = await screen.findByRole("main");
    expect(within(main).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(within(main).queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
});

describe("the first-run wizard", () => {
  it("takes a new install from the admin account to the library", async () => {
    resetDb("fresh");
    const { router } = await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Username"), "owner");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.type(screen.getByLabelText("Repeat the password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Create and continue" }));

    // Metadata service: a wrong key is explained, a right one connects.
    expect(await screen.findByRole("heading", { name: "Connect the metadata service" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Metadata service URL"), "http://meta:8901");
    await userEvent.type(screen.getByLabelText("Admin API key"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("The API key was rejected.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Admin API key"));
    await userEvent.type(screen.getByLabelText("Admin API key"), "meta-admin-key");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(/No metadata provider has entries yet/)).toBeInTheDocument();

    // No entries yet: start the provider's first sync, then check again.
    await userEvent.click(screen.getByRole("button", { name: "Start sync" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText(/No metadata provider has entries yet/)).not.toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    // Source plugins are optional.
    expect(await screen.findByRole("heading", { name: "Add a source plugin" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Plugin URL"), "http://example-plugin:8904");
    await userEvent.click(screen.getByRole("button", { name: "Add plugin" }));
    expect(await screen.findByText("Example Source Plugin")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await userEvent.click(await screen.findByRole("button", { name: "Finish setup" }));
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(db().setupCompletedAt).toBeDefined();
  });

  it("can't be reopened once finished", async () => {
    const { router } = await renderApp("/setup");
    await screen.findByRole("heading", { name: "Library" });
    expect(router.state.location.pathname).toBe("/");
  });

  it("asks a signed-out admin to sign in before carrying on", async () => {
    resetDb("signed-out");
    db().setupCompletedAt = undefined;
    const { router } = await renderApp("/setup");
    await screen.findByRole("heading", { name: "Sign in to Panelarr" });
    expect(router.state.location.search).toEqual({ redirect: "/setup" });
  });
});

describe("invites", () => {
  it("create an account and sign it in", async () => {
    resetDb("signed-out");
    db().invites.push({ ...invite, token: "invite-token" });
    window.location.hash = "#token=invite-token";
    const { router } = await renderApp("/invite");
    expect(await screen.findByRole("heading", { name: "Join Panelarr" })).toBeInTheDocument();

    await userEvent.type(await screen.findByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.type(screen.getByLabelText("Repeat the password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    // The server's per-field error lands on the field.
    expect(await screen.findByText("is taken")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "newcomer");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(window.location.hash).toBe("");
  });

  it("explain an invalid invite", async () => {
    resetDb("signed-out");
    window.location.hash = "#token=used-up";
    await renderApp("/invite");
    expect(await screen.findByRole("heading", { name: "This invite doesn't work" })).toBeInTheDocument();
  });
});
