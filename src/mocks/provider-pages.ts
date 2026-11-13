// SPDX-License-Identifier: GPL-3.0-or-later

// Browser only: single sign-on is a series of navigations (Panelarr's start, the provider's
// pages, Panelarr's callback), which the mock service worker never sees. In full mock mode the
// dev server answers every one of them with the app's index.html, so the mock plays them here,
// before the app starts: the server's start and callback, and the made-up provider's pages.
import { apiBaseUrl } from "@/api/client";
import { commit, db } from "./db";
import { signIn } from "./handlers";
import { finishFlow, type MockFlow, mockProviderUrl, PROVIDER_LOGINS, type ProviderLogin, validReturnTo } from "./oidc";

/** Whether this page load is one of those navigations; if so, it has been answered. */
export function answerSsoNavigation(): boolean {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  if (path === `${new URL(apiBaseUrl()).pathname}/auth/oidc/start`) {
    start(params);
    return true;
  }
  if (path === new URL("mock-provider/authorize", document.baseURI).pathname) {
    authorize(params);
    return true;
  }
  if (path === new URL("mock-provider/end-session", document.baseURI).pathname) {
    // The provider signs out and sends the browser back to Panelarr's sign-in page.
    const back = params.get("post_logout_redirect_uri") ?? "";
    const target = back.startsWith(`${location.origin}/`) ? back : new URL("login", document.baseURI).href;
    page("Example ID", (body) => paragraph(body, "Signed out. Going back…"));
    location.replace(target);
    return true;
  }
  return false;
}

/** `GET /auth/oidc/start`: checks what the server checks, then off to the provider. */
function start(params: URLSearchParams) {
  const d = db();
  const returnTo = params.get("return_to") ?? "/";
  const invite = params.get("invite") ?? undefined;
  if (!d.oidc) return problemPage(404, "not_found", "Single sign-on isn't configured.");
  if (!validReturnTo(returnTo)) return problemPage(400, "invalid_return_to", "return_to must be a path here.");
  if (!d.oidc.reachable) return problemPage(503, "oidc_unavailable", "The identity provider can't be reached.");
  if (invite !== undefined && !d.invites.some((i) => i.token === invite && Date.parse(i.expires_at) > Date.now())) {
    return problemPage(404, "invite_invalid", "This invite link is unknown, used or expired.");
  }
  location.replace(
    mockProviderUrl("authorize", { intent: "login", return_to: returnTo, ...(invite ? { invite } : {}) }),
  );
}

/** The provider's sign-in page: pick who to be, or refuse. */
function authorize(params: URLSearchParams) {
  const flow: MockFlow = {
    intent: params.get("intent") === "link" ? "link" : "login",
    return_to: params.get("return_to") ?? "/",
    ...(params.get("invite") ? { invite: params.get("invite") as string } : {}),
  };
  const finish = (login: ProviderLogin | undefined) => {
    const target = finishFlow(db(), flow, login, (user) => signIn(user, "oidc"));
    commit();
    location.replace(new URL(target, location.origin).href);
  };
  page("Example ID", (body) => {
    paragraph(body, "Sign in to continue to Panelarr.");
    for (const login of PROVIDER_LOGINS) {
      button(body, `Continue as ${login.email}`, () => finish(login));
    }
    button(body, "Cancel", () => finish(undefined));
  });
}

function problemPage(status: number, code: string, detail: string) {
  page(`${status} ${code}`, (body) => paragraph(body, detail));
}

function page(title: string, fill: (body: HTMLElement) => void) {
  document.title = title;
  const main = document.createElement("main");
  main.style.cssText =
    "max-width:24rem;margin:3rem auto;padding:0 1rem;display:grid;gap:0.75rem;font-family:sans-serif";
  const heading = document.createElement("h1");
  heading.textContent = title;
  main.append(heading);
  fill(main);
  document.body.replaceChildren(main);
}

function paragraph(parent: HTMLElement, text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.append(p);
}

function button(parent: HTMLElement, label: string, onClick: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText = "padding:0.6rem;font:inherit";
  b.addEventListener("click", onClick);
  parent.append(b);
}
