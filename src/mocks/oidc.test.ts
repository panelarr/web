// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { invite } from "./data";
import { createDb } from "./db";
import { checkStart, finishFlow, PROVIDER_LOGINS, startRefusalPage, validReturnTo } from "./oidc";

const login = (subject: string) => PROVIDER_LOGINS.find((l) => l.subject === subject);

// The mock's callback follows the server's rules, so the browser journeys built on it mean something.
describe("the mock single sign-on callback", () => {
  it("signs a linked login in, and refuses one nobody is linked to", () => {
    const d = createDb("sso-signed-out");
    const signedIn: string[] = [];
    expect(
      finishFlow(d, { intent: "login", return_to: "/downloads" }, login("example-reader"), (u) =>
        signedIn.push(u.username),
      ),
    ).toBe("/downloads");
    expect(signedIn).toEqual(["reader"]);
    expect(finishFlow(d, { intent: "login", return_to: "/" }, login("example-newcomer"), () => {})).toBe(
      "/login?sso_error=not_linked",
    );
    expect(finishFlow(d, { intent: "login", return_to: "/" }, undefined, () => {})).toBe(
      "/login?sso_error=provider_error",
    );
  });

  it("accepts an invite once, with the role the admin groups give", () => {
    const d = createDb("sso-signed-out");
    d.invites = [{ ...invite, role: "admin", token: "t" }];
    const flow = { intent: "login" as const, return_to: "/", invite: "t" };
    expect(finishFlow(d, flow, login("example-newcomer"), () => {})).toBe("/");
    const created = d.users.find((u) => u.username === "newcomer");
    expect(created?.role).toBe("user"); // not in panelarr-admins
    expect(d.identities.some((i) => i.user_id === created?.id)).toBe(true);
    expect(d.invites).toEqual([]);
    expect(finishFlow(d, flow, login("example-admin"), () => {})).toBe("/login?sso_error=invite_invalid");
  });

  it("links to the signed-in user, refusing someone else's login", () => {
    const d = createDb("sso");
    const flow = { intent: "link" as const, return_to: "/settings?tab=security&sso=linked" };
    expect(finishFlow(d, flow, login("example-reader"), () => {})).toBe(
      "/settings?tab=security&sso=linked&sso_error=already_linked",
    );
    expect(finishFlow(d, flow, login("example-admin"), () => {})).toBe(flow.return_to);
    expect(finishFlow(d, flow, login("example-newcomer"), () => {})).toBe(`${flow.return_to}&sso_error=link_exists`);
  });

  it("refuses return_to outside the app", () => {
    expect(validReturnTo("/library")).toBe(true);
    for (const bad of ["//evil.example", "https://evil.example/", "/api/v1/me", "/api", "relative"]) {
      expect(validReturnTo(bad)).toBe(false);
    }
  });
});

// A refused start is a browser navigation: like the server, the mock sends it back to the app.
describe("the mock single sign-on start", () => {
  const start = (over: Partial<Parameters<typeof checkStart>[1]> = {}) => ({
    return_to: "/downloads",
    intent: null,
    invite: null,
    csrf_token: null,
    ...over,
  });

  it("goes on to the provider, or stays a 404 without single sign-on", () => {
    expect(checkStart(createDb("sso-signed-out"), start())).toEqual({ go: "provider" });
    expect(checkStart(createDb("signed-out"), start())).toEqual({ go: "problem" });
  });

  it("sends a refused sign-in to the login page, keeping a valid return_to as redirect", () => {
    const d = createDb("sso-signed-out");
    expect(checkStart(d, start({ invite: "unknown" }))).toEqual({
      go: "/login?sso_error=invite_invalid&redirect=%2Fdownloads",
    });
    expect(checkStart(d, start({ return_to: "/api/v1/me" }))).toEqual({ go: "/login?sso_error=invalid_return_to" });
    expect(checkStart(d, start({ return_to: "//evil.example" }))).toEqual({ go: "/login?sso_error=invalid_return_to" });
    expect(startRefusalPage({ return_to: "/", intent: null }, "oidc_unavailable")).toBe(
      "/login?sso_error=oidc_unavailable",
    );
  });

  it("sends a refused link back to its return_to", () => {
    const back = "/settings?tab=security&sso=linked";
    const link = start({ intent: "link", return_to: back });
    expect(checkStart(createDb("sso"), link)).toEqual({ go: `${back}&sso_error=csrf_failed` });
    expect(checkStart(createDb("sso"), { ...link, csrf_token: "mock-csrf-token" })).toEqual({ go: "provider" });
    expect(checkStart(createDb("sso-signed-out"), link)).toEqual({ go: `${back}&sso_error=unauthenticated` });
    expect(checkStart(createDb("sso"), { ...link, invite: "t" })).toEqual({ go: `${back}&sso_error=invalid_request` });
    // Never back to a return_to that isn't valid.
    expect(checkStart(createDb("sso"), { ...link, return_to: "https://evil.example/" })).toEqual({
      go: "/login?sso_error=invalid_return_to",
    });
  });
});
