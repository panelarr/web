# Working with the API

The app only uses the Panelarr server's public API (REST under `/api/v1`, plus server-sent
events), the same API any other client may use. Its description, `api/openapi.yaml`, belongs
to the server.

## The spec copy

`api/openapi.yaml` is a copy of the server's spec at a known commit (`api/SPEC_SOURCE`).

```sh
make spec-sync    # copy it from ../server (main) and regenerate the types
make spec-check   # does the copy still match the server's main?
```

`SERVER_REPO` and `SERVER_REF` point elsewhere when needed.

## Generated types

`make gen` turns the spec (plus the drafts, below) into `src/api/schema.gen.ts` with
`openapi-typescript`. The client in `src/api/client.ts` is `openapi-fetch`, with
`openapi-react-query` hooks on top:

```tsx
const info = $api.useQuery("get", "/system/info");
const login = $api.useMutation("post", "/auth/login");
```

Paths, parameters, bodies and responses are all typed. `make check` fails when the generated
files are stale.

## Drafts: endpoints the server doesn't have yet

When a screen needs an endpoint the server hasn't specified yet, its shape goes into
`api/drafts/<area>.yaml` as a partial OpenAPI document in the server's style, and is proposed
to the server. The server decides the final shape. Draft operations:

- are typed like the rest (`make gen` merges them, marked `x-panelarr-draft`);
- are listed in `src/api/drafts.gen.ts`;
- are answered by the mock server during development (below).

Once the server's spec defines a draft's path or schema, `make gen` fails and names it:
delete it from the draft and fix whatever changed.

## The mock server

`src/mocks/` answers API calls with made-up data (MSW). It is used in three places:

| Where | What is mocked |
|---|---|
| `make run-mock` | Everything; no server needed |
| `make run` | Only draft endpoints; everything else goes to the real server (`PANELARR_BACKEND`, default `http://localhost:8900`) |
| Tests (Vitest, Playwright) | Everything |

The mock server keeps state (`src/mocks/db.ts`): signing in, creating keys or finishing setup
behave as on a real server. Pick a starting point with `?mock=<scenario>` (it lasts for the tab):

| Scenario | Starts as |
|---|---|
| `ready` (default) | Set up, signed in as the admin (`admin` / `password123`) |
| `fresh` | A new install: no accounts, nothing connected |
| `signed-out` | Set up, nobody signed in |
| `user` | Signed in as `reader`, a user without admin rights |
| `degraded` | Signed in, but the metadata service has no entries yet |

Mocks can't quietly drift from what the server sends: every fixture is validated against the
spec's schemas (`src/mocks/fixtures.test.ts`), and in tests every JSON answer the mock server
gives is checked against the operation's response schema (`src/test/setup.ts`); a mismatch
fails the test. Fixtures use invented names only: never real sites, extensions or records.

## Errors

Every failed call becomes an `ApiError` (`src/api/errors.ts`): the server's RFC 9457 problem
(stable `code`, per-field `errors`, `request_id`), a response that isn't one (a proxy's page,
shown only as a status), or status `0` when there was no response. TanStack Query retries
network failures and 5xx responses twice, never 4xx, never mutations. `ErrorAlert` shows the
message, the code and a copyable request ID.

## Live events

`src/api/events.ts` keeps one `EventSource` on `/api/v1/events` while the user is signed in
(`EventsProvider` in the app shell).

- **Invalidations.** Each event marks the cached queries it affects as stale (the
  `INVALIDATIONS` table). They are batched for half a second, so a burst refetches once.
- **Targeted invalidations.** Some events concern one thing (the `TARGETED` table):
  `plugin.health` refreshes that plugin, the plugins list and the sources lists, but not the
  plugin's settings, which would reset a form being edited. Repeats within a batch refetch once.
- **Patches.** Progress events change cached data in place instead (the `PATCHES` table):
  refetching task lists several times a second would swamp the server. A plugin's new health
  is patched in too, so it shows before the refetch.
- **Listeners.** `useEvent(type, fn)` hands a component an event's data, e.g. a run's live
  progress (`useRun`).
- **Reconnects.** The server doesn't replay events, so after a reconnect every active query
  refetches. A refused stream (signed out) is retried with back-off.

The data of each event is typed in `src/api/event-types.ts`, following the server. In tests a
fake `EventSource` (`src/test/fake-event-source.ts`) receives the mock server's events, and in
`make run-mock` the mock server streams them for real.
