# Single sign-on (OIDC)

The server can let users sign in with an OpenID Connect identity provider next to their
password. It's configured on the server only (its environment); the app reads what's on and
shows it, and never decides who may do what. Everything below appears only when
`GET /auth/methods` includes `oidc`: without it the app looks and works exactly as before.

## Signing in

The login page is built from `GET /auth/methods`, asked before the page shows:

- `oidc` present: the SSO button (with the server's label) sits above the password form.
- `password: admins`: the password form is behind **Use a password**, which says that password
  sign-in is for admins.

The button is a plain link to `GET /api/v1/auth/oidc/start?return_to=<page>`: a browser
navigation, not an API call, because the server sends the browser on to the provider.
`return_to` is the page the visitor was going to, as a path on the server (under the URL base
when there is one), never a page in the API.

When single sign-on fails, the server sends the browser back to `/login?sso_error=<code>`. The
page shows a plain message for each code it knows, a generic one for any other, and
**Try again** and **Use a password**. The code itself is never shown: it's matched against the
app's own list (anything that isn't a short lowercase code counts as unknown), so a crafted link
can't put text or markup on the page.

A start the server refuses before it gets to the provider (an invite that's gone, a `return_to`
that isn't a page here, the provider unreachable) is a browser navigation too, so the server
sends it to the same page rather than answering JSON: `/login?sso_error=<code>&redirect=<page>`,
with the page the start was for kept in `redirect` (when it was valid). **Try again** and the
SSO button start again towards that page. Only "single sign-on isn't configured" stays a `404`.

## Invites

An invite page offers **Accept with SSO** next to choosing a username and password. It
navigates to `start?invite=<token>`; the server creates the account with the invite's role and
permissions and links the login. With admin groups configured, the provider's groups decide the
role at every sign-in, so an admin invite accepted by someone outside them creates a user. The
invite dialog warns about that when the admin role is picked (from `GET /system/auth`).

## Linked logins

Settings → Security has a **Linked logins** card: each login's provider, email, when it was
linked and last used, and **Unlink**. **Link SSO login** sends `POST /auth/oidc/link` (an API
call, so it carries the CSRF header and no other site can start it) and then sends the browser to
the `redirect_to` it answers. The provider sends it back to the security tab, marked
`sso=linked`, with `sso_error` added when linking failed; the page says which and takes both out
of the address. The older navigation `start?intent=link` isn't used; when another page starts
one and the server refuses it (signed out, an API key, no CSRF token, from another site), the
server sends the browser back to its `return_to` with `sso_error`, and the security tab explains
it the same way.

The server refuses to unlink someone's only way in (`409 last_login_method`); the card says to
set a password first. Users created by single sign-on have no password (`has_password: false`):
their password card sets a first one, without asking for a current password.

Admins see an **SSO** mark on linked users (`sso: true`) in the users list, and a user's page
lists their logins with Unlink (which also ends their single sign-on sessions) and offers to set
a first password.

Admin → Health shows how single sign-on is configured, read-only, and whether the provider can be
reached (`GET /system/auth`). The client secret never reaches the app.

## Signing out

`POST /auth/logout` answers `204` when only Panelarr's session ends: the app goes to the login
page. After a single sign-on session with provider logout configured, it answers `200` with
`redirect_to`, the provider's end-session page, and the app sends the browser there; the provider
sends it back to the login page.

## In the mock server

Starting single sign-on is a series of navigations, which the mock service worker never sees. In
full mock mode the dev server answers them with the app's page, and `src/mocks/provider-pages.ts`
plays the server's start and callback and a made-up provider ("Example ID") before the app starts:
its page lets you continue as one of a few logins or cancel. The start refuses as the server does
(sending a browser back with `sso_error`), and the callback follows the server's rules (linked login, link, invite, automatic provisioning, roles from groups). Scenarios `sso`,
`sso-signed-out` and `sso-admins` turn it on (`docs/api.md`).
