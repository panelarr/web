// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { invite } from "./data";
import { createDb } from "./db";
import { finishFlow, PROVIDER_LOGINS, validReturnTo } from "./oidc";

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
