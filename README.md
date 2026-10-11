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

## Licence

GPL-3.0-or-later ([LICENSE](LICENSE)). The Panelarr logo (`src/assets/`, `public/favicon.svg`
and the icons) is licensed under CC BY 4.0.
