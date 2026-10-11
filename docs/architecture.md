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

## Responsive by design

Phones get a native-app layout: a top bar, a bottom navigation bar, full-screen pages, safe
areas for notches and the home indicator. From the `md` breakpoint (768 px) up, a sidebar
replaces both bars. No page may scroll sideways at 360 px; a Playwright test checks every page.

## Theming

Colour themes are data (`src/theme/presets.ts`): each sets every colour token as a CSS
variable, and Tailwind maps its colour names onto those variables (`src/styles.css`). The
accent colour (Panelarr pink by default) is applied on top, with its text colour picked for
contrast. Fonts are data too (`src/theme/fonts.ts`) and bundled with the app; only the chosen
one loads.

`public/theme-boot.js` applies the saved theme before the app's code runs, so there is no
flash of the wrong colours. It is a file rather than inline script, which the CSP forbids.

## Lessons kept from Panelarr's other admin UIs

- Tabs bound to the URL take their selected value from the parsed search parameter, never
  from link matching (which ignores search parameters and marked several tabs selected).
- Table cells never become flex containers: wrap the content in a `div`. Flex children that
  hold text get `min-w-0` and `overflow-wrap: anywhere`.
- One error type for every failure, so every screen shows errors the same way.
