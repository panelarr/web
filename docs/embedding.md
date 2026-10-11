# Serving the web app

The Panelarr server ships this app inside its own binary: it pins a web release, embeds the
files and serves them next to the API. This page is the contract between the two. Anyone
serving the app another way (a reverse proxy, a static host in front of the API) follows
the same rules.

## The release artifact

Each web release attaches `panelarr-web-<version>.tar.gz` to its GitHub release, plus
`panelarr-web-<version>.tar.gz.sha256`. The archive holds the contents of `dist/` at its root:

| Path | What it is |
|---|---|
| `index.html` | The app's only HTML page |
| `assets/*` | Scripts, styles, fonts and images. File names carry a content hash |
| `sw.js`, `workbox-*.js` | The service worker (caches the app shell only, never API data) |
| `manifest.webmanifest` | The installable-app manifest |
| `theme-boot.js` | Applies the saved theme before the first paint |
| `favicon.svg`, `icon-*.png`, `apple-touch-icon.png` | Icons |

## Routing

- Serve the files at the app's root (`/` in this version).
- **SPA fallback:** a `GET` or `HEAD` for any other path answers `index.html` with status 200,
  **except** paths under `/api/`, `/opds/`, `/assets/`, and `/healthz`, `/readyz`, `/metrics`.
  A missing `/assets/…` file is a plain 404, so a stale page never receives HTML in place of a script.
- `sw.js` must be served from the app's root, with a JavaScript content type, so its scope covers the whole app.

## Caching

| Files | `Cache-Control` |
|---|---|
| `assets/*` | `public, max-age=31536000, immutable` |
| everything else, including `index.html` and `sw.js` | `no-cache` |

## Security headers

Send these with every app response (`index.html` and the files). The exact values live in
[`csp.config.mjs`](../csp.config.mjs); `vite preview` sends the same, and the `csp` Playwright
project fails on any violation, so a change to the app that needs a looser policy shows up in CI.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self';
  worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

- **Scripts** are same-origin files only: no inline scripts, no `eval`. The build checks this
  (`scripts/check-dist.mjs`).
- **Styles** allow inline: UI libraries insert `<style>` elements at runtime (dialog scroll
  locking, toasts). The app's own HTML has none.
- **Images** are same-origin: covers and pages come through the server's API (signed URLs).
- Everything is self-hosted, fonts included. The app never loads from another host.

## API and events

The app calls the API at `api/v1/…` and opens the event stream at `api/v1/events`, both
relative to its base, with the session cookie. It sends `X-CSRF-Token` (from the
`panelarr_csrf` cookie) on every request that changes something.

## A URL base (later)

Every path in the build is relative and resolves against `<base href="/">` in `index.html`.
To serve Panelarr under a prefix such as `/panelarr/`, the server would rewrite that one tag
when serving `index.html` and apply the routing rules under the prefix. The app derives its
router base, API URL and service-worker scope from it. This version serves at the root only.
