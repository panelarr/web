# Importing from another app

Settings → Import brings a user's library from Suwayomi or Mihon into their own Panelarr
account, from a backup file made in that app (`.tachibk`). The server reads the file, keeps only
the parsed series and matches each one against the catalogue and Panelarr's sources
(`/me/imports`, tag `imports` in the server's spec). The app only shows what the server decided.

## Upload

The upload area takes one file (picked or dropped) and sends it as the multipart field `file`.
It has no `accept` filter: phones grey out files whose type they don't know, and backups have an
extension of their own. Files over 64 MiB are refused before sending, as the server would refuse
them anyway (`413 too_large`). The other answers:

| Answer | Shown |
|---|---|
| `202` | the new import's page, while it is matched |
| `200` | the earlier import of the same file, with a note saying so |
| `422 bad_backup` | "That file isn't a backup Panelarr can read", with the server's reason |
| `409 import_running` | that an import is already running, with a link to it |
| `409 too_many_imports` | the server's message (it names the cap), and to delete an old import first |
| `429 busy` | that the server is busy, counting down `Retry-After`, then Try again |

## Preview

`/settings/imports/$importId` shows one import, all of it from the server, so a reload or
another device shows the same:

- **Matching:** while the import is `previewing`, a progress bar fed by `import.progress`
  events (patched into the cached import in place). `import.finished` refetches the import and
  its series.
- **Totals:** series, chapters read, bookmarks and chapters in progress, and what the backup
  holds that isn't imported (series outside its library, tracker links).
- **Package hints:** when a plugin offers a package that would provide missing sources. Admins
  get a link to that package in the plugin's Extensions tab; everyone else is told to ask an
  admin.
- **Categories:** not imported yet; the note says how many there are.
- **Tabs by outcome** (Ready, Already in library, Needs a choice, Not found, Source missing,
  Not allowed), the selected one in the URL (`?outcome=`), each a paged list of series with their
  source's name (as the backup names it) and chapters read.
- **Delete:** removes the import and its rows; what it already imported stays.

## Apply

A finished preview has **Apply import**, which asks first: deleting the import later doesn't
take out what it brought in (Remove and Mark unread do). `POST …/apply` answers with the import
`applying`; from then on it works like matching:

- **Progress:** a bar fed by `import.progress` (series applied out of all of them), the same
  patch in place as the preview's, so a reload or another device shows where it is.
  `import.finished` refetches the import, its series and the list.
- **Cancel import** (`POST …/cancel`) stops matching or applying between series. What was
  applied stays applied. `409 import_not_running` means it stopped meanwhile: the page refetches.
- **Resume:** an import cancelled or failed after its preview finished shows **Resume import**,
  which applies it again; the server goes on with the series it hasn't applied. One cancelled
  while matching has nothing to apply (its series are still `pending`), so it has no button.
- `409 import_running` says another import runs, with a link to it; `409 import_state` shows the
  server's reason.

## Report

Once apply has gone through any series, the page adds the report above the totals: how many
series were **Imported**, **Already imported** (nothing left to change: the backup was applied
before) and **Skipped** (`Import.results`). When apply capped last-read times that were in the
future, a note says how many (`summary.clamped_times`).

The tabs stay those of the preview. Each series also shows its `result`, how many chapters were
placed, how many wait for their chapters (`pending`: a newly attached series is checked first)
and how many couldn't be placed, and the server's `message` (for example that the backup's
series wasn't attached because the account may not add works or fix matches, or that another
series on the source was kept).

## Choosing the work of a series

Series that need a choice or weren't found, and skipped ones, have **Choose** (not while the
import runs). The dialog lists the server's candidates with how alike they are, and searches the
catalogue with the same search as adding a work from Browse (`useCatalogSearch`), starting from
the series' title. Picking one sends `{entry_id}`; series that weren't applied can be skipped
instead (`{skip: true}`).

Before apply, the choice waits for apply and the series moves to the tab the server gives it
(Ready, Already in library or Source missing). After apply, the server imports the series right
away, without uploading the backup again. `422 not_allowed` shows its reason in the dialog.

## Mocks

The mock server (`src/mocks/imports.ts`) can't read a backup: any gzip file is a backup holding
the same made-up library of 42 series, spread over every outcome, matched 12 series a second
and applied 5 a second in the browser (slow enough to cancel). Applying adds the series' works
to the library; a series some earlier import of the same user applied comes back
`already_imported`, even after that import was deleted. A user keeps at most 20 imports. In component tests jsdom's files lose their bytes on the way through Node's
fetch, so the tests hand the file's bytes to the mock's `receiveBackup` themselves.
