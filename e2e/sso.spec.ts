// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page, test } from "@playwright/test";

// Single sign-on against the mock server's made-up identity provider ("Example ID", see
// src/mocks/oidc.ts): the login page, the provider's page, its callback, linking and invites.
// Scenarios: sso (the admin signed in), sso-signed-out, sso-admins (passwords for admins only).

const ssoButton = (page: Page) => page.getByRole("link", { name: "Sign in with Example ID" });

/** At the made-up provider: sign in as one of its logins (or Cancel). */
async function atProvider(page: Page, choice: string) {
  await expect(page.getByRole("heading", { name: "Example ID" })).toBeVisible();
  await page.getByRole("button", { name: choice }).click();
}

/** Signs the admin out (the desktop menu is named after them), until the login page shows. */
async function signOut(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "More" }).click();
  }
  const signIn = page.getByRole("heading", { name: "Sign in to Panelarr" });
  // A toast can sit over the button on a phone for a moment: try again until signed out.
  await expect(async () => {
    if (await signIn.isVisible()) return;
    if (isMobile) {
      await page.getByRole("button", { name: "Sign out" }).click({ timeout: 5_000 });
    } else {
      await page.getByRole("button", { name: /Admin/ }).click({ timeout: 5_000 });
      await page.getByRole("menuitem", { name: "Sign out" }).click({ timeout: 5_000 });
    }
    await expect(signIn).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

async function noSidewaysScroll(page: Page, what: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${what} is wider than the screen`).toBeLessThanOrEqual(0);
}

test.describe("signing in with SSO", () => {
  test("goes to the provider and back, signed in, where the visitor was going", async ({ page }) => {
    await page.goto("/login?mock=sso-signed-out");
    await expect(ssoButton(page)).toBeVisible();
    // A page that needs signing in sends the visitor to the login page, and back after.
    await page.goto("/downloads");
    await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();
    // The button sits above the password form.
    const button = await ssoButton(page).boundingBox();
    const username = await page.getByLabel("Username").boundingBox();
    expect(button && username && button.y < username.y).toBe(true);
    await noSidewaysScroll(page, "the login page");

    await ssoButton(page).click();
    await atProvider(page, "Continue as reader@example.com");
    await expect(page.getByRole("heading", { name: "Downloads", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/downloads$/);
  });

  test("explains a login nobody is linked to, and still lets an admin use a password", async ({ page }) => {
    await page.goto("/login?mock=sso-signed-out");
    await ssoButton(page).click();
    await atProvider(page, "Continue as newcomer@example.com");
    await expect(
      page.getByText("No Panelarr account is linked to this login; ask an admin for an invite."),
    ).toBeVisible();
    await expect(page).toHaveURL(/sso_error=not_linked/);
    await noSidewaysScroll(page, "the login page with an error");

    await page.getByRole("button", { name: "Use a password" }).click();
    await expect(page.getByText(/No Panelarr account is linked/)).toBeHidden();
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  });

  test("tries again from the error, or explains a cancelled sign-in", async ({ page }) => {
    await page.goto("/login?mock=sso-signed-out");
    await ssoButton(page).click();
    await atProvider(page, "Cancel");
    await expect(page.getByText("The identity provider didn't sign you in.")).toBeVisible();
    await page.getByRole("link", { name: "Try again" }).click();
    await atProvider(page, "Continue as casey@example.com");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  });

  test("explains each error code in plain words, and unknown ones generically", async ({ page }) => {
    const codes: [string, string][] = [
      ["flow_expired", "The sign-in took too long, or was started in another tab. Try again."],
      ["account_disabled", "Your Panelarr account is disabled. Ask an admin."],
      ["not_allowed", "Your login at the identity provider isn't allowed to use Panelarr. Ask an admin."],
      ["invite_invalid", "The invite was used up or has expired. Ask an admin for a new one."],
      ["rate_limited", "Too many sign-in attempts. Wait a few minutes and try again."],
      ["brand_new_code", "Signing in with SSO didn't work. Try again."],
      ["<b>bold</b>", "Signing in with SSO didn't work. Try again."],
    ];
    for (const [code, message] of codes) {
      await page.goto(`/login?mock=sso-signed-out&sso_error=${encodeURIComponent(code)}`);
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Use a password" })).toBeVisible();
      await expect(page.locator("main, body").getByText(code, { exact: true })).toHaveCount(0);
      await expect(page.locator("b")).toHaveCount(0);
    }
  });

  test("keeps passwords behind Use a password when they're for admins only", async ({ page }) => {
    await page.goto("/login?mock=sso-admins");
    await expect(ssoButton(page)).toBeVisible();
    await expect(page.getByLabel("Username")).toHaveCount(0);
    await noSidewaysScroll(page, "the admins-only login page");

    await page.getByRole("button", { name: "Use a password" }).click();
    await expect(page.getByText(/Password sign-in is for admins/)).toBeVisible();
    await page.getByLabel("Username").fill("reader");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong username or password.")).toBeVisible();

    await page.getByLabel("Username").fill("admin");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  });
});

test.describe("linked logins", () => {
  test("link a login, sign in with it, sign out at the provider, and unlink it", async ({ page, isMobile }) => {
    await page.goto("/settings?tab=security&mock=sso");
    await expect(page.getByText("No login is linked yet.")).toBeVisible();
    await noSidewaysScroll(page, "the security tab");
    await page.getByRole("button", { name: "Link SSO login" }).click();
    await atProvider(page, "Continue as admin@example.com");
    await expect(page.getByText("Single sign-on login linked.")).toBeVisible();
    const logins = page.getByRole("list", { name: "Linked logins" });
    await expect(logins.getByText(/admin@example\.com · linked/)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\?tab=security$/);

    // Signed in with a password: Panelarr's session only.
    await signOut(page, isMobile);
    await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();

    // Now either way: SSO, then out at the provider and back to the login page.
    await ssoButton(page).click();
    await atProvider(page, "Continue as admin@example.com");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    const endSession = page.waitForRequest((r) => r.url().includes("/mock-provider/end-session"));
    await signOut(page, isMobile);
    await endSession;
    await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    await page.goto("/settings?tab=security");
    await page.getByRole("list", { name: "Linked logins" }).getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText("No login is linked yet.")).toBeVisible();
  });

  test("refuse to unlink the only way in, until a first password is set", async ({ page }) => {
    await page.goto("/login?mock=sso-signed-out");
    await ssoButton(page).click();
    await atProvider(page, "Continue as casey@example.com");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    await page.goto("/settings?tab=security");

    const unlink = page.getByRole("list", { name: "Linked logins" }).getByRole("button", { name: "Unlink" });
    await unlink.click();
    await expect(
      page.getByText("This is your only way to sign in. Set a password first, then unlink it."),
    ).toBeVisible();

    await expect(page.getByLabel("Current password")).toHaveCount(0);
    await page.getByLabel("New password", { exact: true }).fill("a-first-password");
    await page.getByLabel("Repeat the new password").fill("a-first-password");
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByLabel("Current password")).toBeVisible();

    await unlink.click();
    await expect(page.getByText("No login is linked yet.")).toBeVisible();
  });

  test("say why linking failed", async ({ page }) => {
    await page.goto("/settings?tab=security&mock=sso");
    await page.getByRole("button", { name: "Link SSO login" }).click();
    await atProvider(page, "Continue as reader@example.com");
    await expect(page.getByText("That login is already linked to another Panelarr account.")).toBeVisible();
    await expect(page).toHaveURL(/\/settings\?tab=security$/);
  });

  test("an admin sees who has one and unlinks it", async ({ page }) => {
    await page.goto("/admin/users?mock=sso");
    // A row's name: initials, display name, username, marks, then what they may do.
    const reader = page.getByRole("link", { name: / reader / });
    await expect(reader.getByText("SSO", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: / Admin admin / }).getByText("SSO", { exact: true })).toHaveCount(0);
    await reader.click();
    await page.getByRole("list", { name: "Linked logins" }).getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText(/No login is linked/)).toBeVisible();
    await noSidewaysScroll(page, "a user's page");
  });
});

test.describe("invites with SSO", () => {
  test("create the account from the provider's login and use the invite up", async ({ page }) => {
    await page.goto("/invite?mock=sso-signed-out#token=open-invite-token");
    await expect(page.getByRole("heading", { name: "Join Panelarr" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await noSidewaysScroll(page, "the invite page");
    await page.getByRole("link", { name: "Accept with SSO" }).click();
    await atProvider(page, "Continue as newcomer@example.com");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

    await page.goto("/settings?tab=profile");
    await expect(page.getByLabel("Display name")).toHaveValue("Newcomer");
    await page.goto("/invite#token=open-invite-token");
    await expect(page.getByRole("heading", { name: "This invite doesn't work" })).toBeVisible();
  });

  test("an admin invite warns that the provider's groups decide who is an admin", async ({ page }) => {
    await page.goto("/admin/users?mock=sso");
    await page.getByRole("button", { name: "Invite" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Role").selectOption("admin");
    await expect(dialog.getByText("The identity provider manages the admin role")).toBeVisible();
    await expect(dialog.getByText(/members of panelarr-admins admins/)).toBeVisible();
  });
});

test("an admin sees how single sign-on is set up on Health", async ({ page }) => {
  await page.goto("/admin/health?mock=sso");
  await expect(page.getByRole("heading", { name: /Single sign-on/ })).toBeVisible();
  await expect(page.getByText("https://id.example.com")).toBeVisible();
  await noSidewaysScroll(page, "Health");
});

test("without single sign-on, nothing about it shows", async ({ page, isMobile }) => {
  await page.goto("/login?mock=signed-out");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in with/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use a password" })).toHaveCount(0);

  await page.goto("/invite?mock=signed-out#token=open-invite-token");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accept with SSO" })).toHaveCount(0);

  await page.goto("/settings?tab=security&mock=ready");
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Linked logins" })).toHaveCount(0);

  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: / reader / })).toBeVisible();
  await expect(page.getByText("SSO", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Invite" }).click();
  await page.getByRole("dialog").getByLabel("Role").selectOption("admin");
  await expect(page.getByText("The identity provider manages the admin role")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/admin/health");
  await expect(page.getByRole("heading", { name: "Server" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Single sign-on/ })).toHaveCount(0);

  // Signing out goes straight to the login page.
  await signOut(page, isMobile);
  await expect(page.getByRole("heading", { name: "Sign in to Panelarr" })).toBeVisible();
});
