# Architecture

A single-page app built with Vite, React and TypeScript, installable as a PWA. It holds no
business rules: the server decides what each user may see and do, and the app shows it.

## Stack

| Concern | Choice |
|---|---|
| Routing | TanStack Router, file-based (`src/routes/`), typed search params |
| Server state | TanStack Query, with hooks generated from the API spec ([api.md](api.md)) |
| Long lists, the long-strip reader | TanStack Virtual |
| Debounce, throttle, queues | TanStack Pacer |
| Client state (reader, preferences) | TanStack Store |
| UI | shadcn/ui components (`src/components/ui/`) on Radix, styled with Tailwind CSS v4 |
| Icons | lucide |
| Installable app | `vite-plugin-pwa` (Workbox); caches the app shell only |
| Tests | Vitest + Testing Library + MSW; Playwright for smoke tests |
| Lint and format | Biome |

## Layout

```
api/              the server's spec (copy) and drafts
scripts/          spec sync, type generation, the dist check
src/api/          client, errors, query defaults, the event stream, generated types
src/components/   app shell, shared states; ui/ holds the shadcn/ui components
src/routes/       one file per page (TanStack Router generates src/routeTree.gen.ts)
src/theme/        colour themes, fonts, the accent, applying them
src/mocks/        the mock server and its fixtures
src/test/         test setup and helpers
e2e/              Playwright smoke tests
```

## Signing in

The server keeps the session in an HTTP-only cookie the app can't read; the app sends the
CSRF token from the readable `panelarr_csrf` cookie with every change.

- **Route guards** (`src/auth/guard.ts`). Every signed-in page first reads the public
  `GET /system/info`: a new install goes to `/setup`. Only when the readable CSRF cookie is
  there (the server sets it with the session cookie, same lifetime) does it ask `GET /me`;
  otherwise it goes straight to `/login?redirect=…`. So visitors and new installs cause no
  failed requests. An admin on an unfinished setup goes to `/setup`. `/login`, `/setup` and
  `/invite` are public.
- **Mid-session.** When any request answers `unauthenticated`, the app forgets everything
  cached and goes to sign-in with `expired`, then back to where the user was. `redirect` only
  ever leads to a path inside the app.
- **First run.** `/setup` creates the admin, connects the metadata service (explaining what
  to do until a provider has entries), optionally adds a source plugin, and finishes. Once
  finished, it redirects away.
- **Invites.** An invite link carries its token in the URL fragment (`/invite#token=…`), which
  browsers never send to the server, so it stays out of logs. The page removes it from the
  address bar once used.

## Responsive by design

Phones get a native-app layout: a top bar, a bottom navigation bar, full-screen pages, safe
areas for notches and the home indicator. From the `md` breakpoint (768 px) up, a sidebar
replaces both bars. No page may scroll sideways at 360 px; a Playwright test checks every page.

## The reader

`src/features/reader/` is a full-screen route outside the app shell (`/read/$chapterId`).

- **Page by page** (`paged-viewer.tsx`): three slots (previous, current, next) on a track that
  follows the finger; slide, fade or no transition (none when reduced motion is asked for).
  Pinch, double tap and Ctrl+wheel zoom with panning (`zoom.ts`), tap zones (`tap-zones.ts`).
  Double page pairs pages as their sizes become known (`spreads.ts`).
- **Long strips** (`strip-viewer.tsx`, `horizontal-viewer.tsx`): TanStack Virtual with measured
  pages and native scrolling and pinch.
- **Settings** (`settings.ts`): the app's own JSON, stored by the server at three levels
  (global, source, series), merged over defaults chosen by the work's type, with where each
  value comes from.
- **Progress** (`use-progress.ts`): saved at most every 2 seconds while reading, and at once
  (keepalive) when leaving.

## Downloads and live updates

Downloads are tasks in the server's queue. Their progress arrives over the event stream and is
patched into cached lists in place (`src/api/events.ts`), so the work page, the downloads page
and the queue update live without refetching.

## Theming

Colour themes are data (`src/theme/presets.ts`): each sets every colour token as a CSS
variable, and Tailwind maps its colour names onto those variables (`src/styles.css`). The
accent colour (Panelarr pink by default) is applied on top, with its text colour picked for
contrast. Fonts are data too (`src/theme/fonts.ts`) and bundled with the app; only the chosen
one loads.

`public/theme-boot.js` applies the saved theme before the app's code runs, so there is no
flash of the wrong colours. It is a file rather than inline script, which the CSP forbids.
Appearance is saved to the account (`/me/preferences`, `src/theme/sync.ts`): on sign-in the
account's choices win, so every device looks the same.

## Installable app

`vite-plugin-pwa` builds the manifest (icons, a maskable icon, shortcuts) and a service worker
that caches the app shell only, never API responses or pages. A new version asks before it
reloads. "Install the app" uses the browser's prompt, or shows the steps on iOS.

## Quality gates

- `make check`: lint, generated types, build with the dist check (strict-CSP safety and size
  budgets: the first visit and all scripts, gzipped), types, unit and component tests (every
  mock answer checked against the spec).
- `make e2e`: Playwright on a desktop and a 360 px phone: the main flows, no sideways
  scrolling, axe accessibility checks (light and dark), a full journey (set up, add, read,
  download), and the production build under the real CSP. Once WebKit is installed
  (`pnpm exec playwright install webkit`), the reader's specs also run on iOS Safari's engine;
  without it, the run says they were skipped. `E2E_WEBKIT=0` leaves them out.

## Lessons kept from Panelarr's other admin UIs

- Tabs bound to the URL take their selected value from the parsed search parameter, never
  from link matching (which ignores search parameters and marked several tabs selected).
- Table cells never become flex containers: wrap the content in a `div`. Flex children that
  hold text get `min-w-0` and `overflow-wrap: anywhere`.
- One error type for every failure, so every screen shows errors the same way.
