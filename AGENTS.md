# Agent instructions

## Before you work

1. Your task brief was given to you by your operator, including where to read its full context. Read the brief and the documents it lists before changing code.
2. Read this repo's own docs: `README.md`, `docs/`, `CONTRIBUTING.md`.
3. Treat the decisions referenced in your brief as requirements. If the code can't satisfy one, stop and report the conflict to your operator. Don't diverge silently.

## Rules for public artifacts

Everything in this repo is public: code, comments, docs, commit messages, branch names, PR and issue text.

- Explain the *why* in your own words. Design reasoning worth keeping publicly goes in `docs/`.
- Design IDs from the project's knowledge base may appear as `Refs:` commit footers, never as the only explanation.

## Confidential terms

Your operator gives you a list of aliases for confidential names (a local file, never committed). Write **only the alias** in code, comments, docs, commits, branches and PR text. Never name real extensions, extension stores or sites. If unsure whether a name is confidential, ask.

## Working here

- Everything runs through `make` (`make help`). Before reporting, run `make check`.
- Branch per slice: `<type>/<scope>-<slug>`. Conventional Commits.
- Commit / merge / push rights come from your brief. If unsure: commit on your branch only, never push.
- After each slice, report to your operator: what you built, what you assumed, how to test it.
- Text you post on the forge from a human's account starts with: `> ⚠️ **AI agent:** written by an AI agent, posted from <owner>'s account.`

## This repo

- **Progress:** [PROGRESS.md](PROGRESS.md) lists the planned slices, what's done and what's next. Re-read it whenever you lose context.
- **The API is the server's:** `api/openapi.yaml` is a copy of the server's spec (`make spec-sync`); never edit it. Endpoints the server hasn't specified yet are drafted in `api/drafts/` and proposed to the server, which owns the final shape. See `docs/api.md`.
- **No business rules:** the server decides what a user may see and do. The app shows it and never relies on hiding things for security.
- **Every screen size:** phones get the native-app layout (bottom bar, safe areas, gestures), desktops the sidebar. Nothing scrolls sideways at 360 px.
- **Strict CSP:** no inline scripts, no `eval`, nothing from other hosts; fonts and icons are bundled. `make build` and `make e2e` check it (`docs/embedding.md`).
- **Mocks match the spec:** every fixture is validated against the API schemas. Mock data uses made-up names only.
- **Licence:** GPL-3.0-or-later (`// SPDX-License-Identifier: GPL-3.0-or-later` at the top of every source file we write; `src/components/ui/` keeps the shadcn/ui originals' form).
- **Secrets:** never log or store passwords, API keys or tokens in the browser (no localStorage); a new API key is shown once.
