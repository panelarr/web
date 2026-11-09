# The library and its views

The library page shows every work in the user's library, loaded whole (every page of
`GET /library`) and filtered and sorted in the browser (`src/features/library/library-view.ts`).
A library of a few thousand works stays quick this way; filtering on the server would need the
same rules written twice, so it waits until it's needed.

## Saved views

What the page shows is a **saved view**: a name and a definition (`LibraryViewDefinition` in
the server's spec) with

- filters that keep (`include`) or leave out (`exclude`) works that are unread, started,
  downloaded, bookmarked or have new chapters; absent means either;
- work types and publication statuses (open lists: the sheet offers the values found in the
  library, plus any the view still holds);
- "updated within N days", on `last_updated_at`;
- a sort (title, recently added, recently read, latest chapter, **recently updated**, unread or
  total chapters), reversible, and the display (layout and badges).

"Recently updated" is when Panelarr last found a new chapter of the work in a later check
(`last_updated_at`), not the source's upload date ("Latest chapter"), which sources often get
wrong or leave out. Works that never had a chapter found that way come after the others, by
their latest chapter.

Views belong to one user and live on the server (`/me/library-views`), so they follow the user
to every device; `library_views.changed` tells the user's other devices to refetch them. The
server keeps the rules: names unique per user (ignoring case), one default, at least one view,
at most 50. The app shows those rules up front (no Delete on the only view) but relies on the
server's answers.

### Editing

The filter / sort / display sheet edits the view shown. Changes show at once and are saved
about half a second after the last one, so a burst of taps is one request; leaving the page
saves what's pending. A refused save puts the view back as the server has it. "Duplicate"
is the way to try a variant without changing a view.

### The URL

- `/?view=<id>` shows a view; `/` the default view. IDs, not names, so a rename doesn't break
  a bookmark. Switching views pushes a history entry, so Back returns to the view before.
- `?q=` is a search on top of the view and is never saved.
- A view that isn't the user's (or no longer exists) shows the default view, with a short
  notice for a link that was never the user's.
- `?only=…` (the filters in the URL before views) is dropped on load, replacing the entry.

### The first view

Users who had the library before views find one view, "Library", made on their first visit
from the sort and display they had (the `library` preference) and no filters. If two devices
do this at once, the second gets `409 name_taken` and fetches the list instead. The old
preference is read, never written again, so an older app still finds it.
