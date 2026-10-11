# Contributing

Thanks for helping. This page covers the development setup and how changes get in.

## Development setup

You need Node.js 24 (the version in `.nvmrc`), pnpm (`corepack enable` installs the version
in `package.json`) and `make`.

```sh
make setup      # dependencies and the Playwright browser
make run-mock   # run against the mock server
make check      # lint, generated types, build (with the CSP check), types and tests: run before every PR
make e2e        # Playwright smoke tests on a desktop and a 360 px phone, plus the CSP check in a browser
make help       # every target
```

### Against a real server

Run a Panelarr server (see its README), then `make run`. The dev server proxies `/api` to
`PANELARR_BACKEND` (default `http://localhost:8900`) and mocks only the endpoints the server
doesn't have yet. See [docs/api.md](docs/api.md).

### The API

`api/openapi.yaml` is a copy of the server's spec; the server owns it. `make spec-sync` updates
the copy from a server clone next to this one (`../server`). Never edit it by hand: propose
changes to the server. Endpoints the server hasn't specified yet are drafted in `api/drafts/`
([docs/api.md](docs/api.md)).

### UI components

`src/components/ui/` holds [shadcn/ui](https://ui.shadcn.com) components, added with the
shadcn CLI and then owned by this repo. They import `cn` from `@/lib/utils`.

```sh
yes n | pnpm dlx shadcn@4.21.4 add <component>   # "n": never overwrite components we changed
```

The CLI writes `import { cn } from "cn"` and adds a `cn` package; change the import to
`@/lib/utils` and `pnpm remove cn` (lint fails until you do).

### Every screen size

Check changes on a phone-sized screen (360 px wide) and on a desktop. No page may scroll
sideways; `make e2e` checks it.

### No site data

Never commit downloaded chapters, images, or records copied from real sites, in code, tests,
fixtures or docs. Mock data uses made-up names.

## Working conventions

- **Tasks:** everything runs through `make`.
- **Branches:** `<type>/<scope>-<slug>`, e.g. `feat/reader-webtoon-mode`.
- **Commits and PR titles:** [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`. Add `!` for breaking changes. PRs are squash-merged, so the PR title becomes the commit message.
- **Reviews:** at least one approval and green checks before merge.
- **AI agents:** agents may open PRs and post reviews. Anything an agent posts from a person's account starts with a **⚠️ AI agent** line. Humans stay responsible for what they merge.
