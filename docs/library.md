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
- content ratings (`content_ratings`: safe, suggestive, erotic, pornographic, unknown), see
  below;
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

### Content rating

A view can keep only works with some content ratings, so a user can have a main view without
18+ works and a separate one with them.

- An entry's rating is its work's `content_rating`, which comes from the metadata: the same
  value the user's ceiling is checked against, so a view and the ceiling never disagree about a
  work. Sources' ratings don't count: they rate a whole site, not a series. A work the metadata
  has no rating for is **Unrated** (`unknown`; a work without the field counts as that too).
- 18+ means **erotic** and **pornographic**; suggestive isn't. "Hide 18+" ticks safe,
  suggestive and unrated, so unrated works stay (untick Unrated for a strict view); "Only 18+"
  ticks erotic and pornographic. Both are shown only to users whose ceiling is erotic or higher
  (admins see every rating). Pressed again, a quick pick clears the ratings.
- The sheet offers the ratings up to the user's ceiling, mildest first, then Unrated, each with
  how many works have it. A rating the view still holds above the ceiling (an admin lowered it
  since) is listed with 0, so it can be taken off.
- A view only narrows: the server leaves works above the ceiling out of `GET /library`, and
  views run in the browser over that, so no view can show them. A stored rating above the
  ceiling just matches nothing.
- On the default view without a rating filter, when the library holds 18+ works, the sheet
  suggests hiding 18+ there and keeping a separate view for them.
- It's a library filter, like the others: the catalogue, updates, history and continue reading
  aren't affected.

### Editing

The filter / sort / display sheet edits the view shown. Changes show at once and are saved
about half a second after the last one, so a burst of taps is one request; leaving the page
saves what's pending. A refused save puts the view back as the server has it (a newer change
still waiting stays, and its save carries both). "Duplicate" is the way to try a variant
without changing a view.

An empty view offers "Edit view" and "Show everything". Some views are meant to be empty most
of the time ("New chapters", "Unread, not downloaded"), so "Show everything" saves nothing: it
shows the whole library for now, with a "Back to <view>" button, and ends when another view is
shown, the sheet is opened, or the page is reloaded.

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
do this at once, the second gets `409 name_taken` and fetches the list instead. The view is
only made once the preferences loaded: if they fail, the library shows with the defaults, saves
nothing, and asks again (after 2 s, then less often), as a view made from the defaults would
lose the user's setup for good. The old preference is read, never written again, so an older
app still finds it.
