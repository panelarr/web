# Progress

The plan for the web app's first version, in slices. Each slice works end to end, has tests and ends with `make check` and `make e2e` green. The first version covers: setup and login, the users admin, the catalogue, adding works and fixing matches, the work page with source tabs and unified chapters, the reader, downloads, the jobs page, themes and fonts.

- [x] **0. Scaffold:** Vite + React + TypeScript, TanStack Router/Query/Virtual/Pacer/Store, shadcn/ui on Tailwind v4, Biome, Vitest + MSW, Playwright (desktop, 360 px phone, CSP); `make` targets, CI, release workflow (dist archive for the server), repo docs. The API client generated from the server's spec plus drafts; the spec copy and its sync; one error type for every failure (problem details, network errors), retry rules; the event-stream client with query invalidation; the mock server with spec-validated fixtures (full or drafts-only). The app shell: sidebar on desktop, top bar + bottom navigation on phones, safe areas; light, dark and true-black themes with the brand accent, applied before the first paint; installable PWA (app shell only); the serving contract with the server (`docs/embedding.md`).
- [x] **1. Setup and login:** first-run gate and wizard (admin → metadata service: connect, what to do, check again, start a provider's sync and watch entries arrive → optional source plugin → finish; can't be reopened once finished); sign-in (wrong password, rate limit with Retry-After), sign-out, invite links (token in the URL fragment); settings with URL-bound tabs: profile, password, sessions (sign out others), API keys (scopes, expiry, shown once, revoke), appearance; route guards and mid-session expiry → sign in again and come back; admin-only navigation; health banner for admins; a stateful mock server with scenarios, and every mock response checked against the spec in tests; the CSP browser test runs the real UI (dialog, toast, theme) with a faked API.
- [x] **2. Users, plugins and sources admin:** admin area (admins only) with sections; users: list with what each may do, add (password, role, grants), invite links (token in the fragment, shown once, share), open invites (revoke); a user's page: account (display name, role, disabled; never yourself), permissions (add, download, fix matches, content ceiling, all or picked sources; only changes are sent), password reset, delete; plugins: add, on/off, sync now, remove, connection (URL, key: keep, replace or remove), settings form generated from the plugin's JSON Schema with its field errors; sources: search and filters in the URL (plugin, language, status), health and reasons, on/off; system: component health and the metadata connection.
- [x] **3. Catalogue:** search every title as you type (debounced, never pulling you back after you tap a result), browse with type/status/genre/year filters and sort kept in the URL (a side sheet on desktop, a bottom sheet on phones; filters in use as removable chips), cover grid with infinite loading, "matched" titles, "In library" marks, empty and "no provider" states; the entry page: titles, credits, genres, description (HTML and Markdown shown as plain text, never markup), tags with spoilers hidden, all titles, links, attribution; "Add to library" (respects the add permission).
- [ ] **4. Jobs, queue and live events:** jobs by group with runs, status filter, parameter form, run now / cancel, "already running" → the current run; task queue per kind (pause/resume, cancel, retry); live updates over the event stream.
- [ ] **5. Library, add and fix match:** library grid/list (virtualised), sort and filters, unread badges; add from the catalogue with per-source match state live; fix match (candidates with evidence, attach, detach, re-run, paste a URL); browse a source and add from it.
- [ ] **6. Work page:** metadata, the unified chapter list (chosen variant and why, pin a variant), a tab per source, source health and priority, check for updates, new badges, read/unread.
- [ ] **7a. Reader, core:** full-screen reader; single page (LTR/RTL), continuous vertical, webtoon; fit and zoom (pinch, double tap, wheel); tap zones, swipe, keyboard; preloading; progress sync; next chapter; settings per user at global, source and series level.
- [ ] **7b. Reader, more modes:** double page (spread detection, cover offset), continuous horizontal (LTR/RTL), page transitions, polish.
- [ ] **8. Downloads:** download one, a range or all unread; "download new chapters"; the downloads page with live progress; pause, retry, cancel (admins); storage endpoints (local, S3-compatible: configure, test, default).
- [ ] **9. Themes and fonts:** more preset themes, custom accent and key colours (contrast-checked), UI font choice, reader background; saved per user on the server.
- [ ] **10. PWA and hardening:** install and update flow, accessibility pass, a smoke test over setup → add → read → download, bundle budget, first release.

## Working assumptions

Settled for now, cheap to change:

- The brand pink (`#E0457B`) is the default accent; theme presets and fonts are data (`src/theme/`).
- The app is served at the root; every asset path is relative to `<base href>` so a URL base can come later (`docs/embedding.md`).
- Inline styles are allowed by the CSP (UI libraries insert `<style>` at runtime); scripts are strictly same-origin.
- Reader settings and appearance are per user (per-series overrides too), stored by the server; until the server has them, appearance is kept per device.
- Library categories and the connected services' admin pages are not part of the first version.

## Next

Slice 4: jobs, queue and live events.
