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

Applying an import, its report and resolving series by hand come next.

## Mocks

The mock server (`src/mocks/imports.ts`) can't read a backup: any gzip file is a backup holding
the same made-up library of 42 series, spread over every outcome, matched 12 series a second
in the browser. In component tests jsdom's files lose their bytes on the way through Node's
fetch, so the tests hand the file's bytes to the mock's `receiveBackup` themselves.
