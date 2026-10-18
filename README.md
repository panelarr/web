# Panelarr web

The web app of [Panelarr](https://github.com/panelarr), a self-hosted, *arr*-style app for
curating, downloading, managing and reading manga, manhwa, manhua and comics, with real
multi-user support.

It is the library, the reader and the admin: browse the catalogue, add works, read on a phone
like a native app or on a desktop with keyboard and mouse, follow downloads and manage the
server. It talks only to the [Panelarr server](https://github.com/panelarr/server)'s public
API, so anyone can build their own client against the same API.

> **Status:** early development. The first version is being built in slices; see
> [PROGRESS.md](PROGRESS.md). Nothing is released yet.

## What it does

- **Set up and sign in:** a first-run wizard (admin account, metadata service, source plugins), sign-in, invite links, sessions and API keys.
- **Find and add works:** search and browse the catalogue (every title, in every language). One entry per work, matched on all your sources; each work shows its sources and their languages.
- **Fix matches:** see how a work is matched on each source, with the evidence; attach, reject, search the work's source yourself or paste a link.
- **Chapters:** one list across sources, filling gaps from each, with the chosen copy and why; a tab per source; new chapter badges.
- **Read:** a full-screen reader for phones and desktops: single or double page, vertical, webtoon or horizontal scroll, right to left or left to right, swipe, pinch and double-tap zoom, tap zones, keyboard shortcuts, settings per series, per source or everywhere, and progress that follows you across devices.
- **History:** what you read, by day, one line per series with Resume; every chapter read, search, remove or clear.
- **Download:** chapters stored once for everyone, live progress, automatic downloads of new chapters, local or S3-compatible storage.
- **Run it:** users and permissions, plugins and their extensions (install, update and uninstall from their stores, with languages), sources (an admin concern: on or off, by language and extension; browse one to test it, and add from there), network (shared proxies, challenge solvers and profiles, chosen per plugin, extension, source or provider; see `docs/network.md`), jobs (the server's, the metadata service's and plugins', in one view) and the task queue, the metadata service (providers and syncs, duplicates, search; see `docs/admin.md`), each plugin's own admin (stores, sources' health checks, jobs), system health.
- **Make it yours:** themes (including true black), accent and key colours, fonts; saved to your account.
- **Install it:** an installable app (PWA) on phones and desktops.

## Using it

You don't install this repo on its own: the Panelarr server embeds a pinned release and serves
it. Open the server's address in a browser, and install it as an app from the browser's menu
("Install" or "Add to Home Screen").

## Development

You need Node.js 24 (`.nvmrc`), pnpm (`corepack enable` sets it up) and `make`.

```sh
make setup      # dependencies and the Playwright browser
make run-mock   # the app with a mock server: no Panelarr server needed
make run        # the app against a Panelarr server at PANELARR_BACKEND (default http://localhost:8900)
make check      # lint, generated types, build, type check and tests: run before every PR
make help       # every target
```

The dev server listens on http://localhost:5173.

## Docs

- [Architecture](docs/architecture.md): stack, layout, theming
- [Working with the API](docs/api.md): the spec copy, generated types, drafts, mocks, errors, events
- [Serving the web app](docs/embedding.md): the contract with the server (routing, caching, CSP)
- [Network](docs/network.md): proxies, solvers and profiles, and where each is chosen
- [Connected services in the admin](docs/admin.md): the metadata service and plugins inside Panelarr's admin, one Jobs view for all

## Licence

GPL-3.0-or-later ([LICENSE](LICENSE)). The Panelarr logo (`src/assets/`, `public/favicon.svg`
and the icons) is licensed under CC BY 4.0.
