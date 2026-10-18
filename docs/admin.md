# Connected services in the admin

Panelarr's admin also runs the services it depends on: the metadata service and source plugins.
Everything an admin does in their own admin pages can be done from Panelarr's, through the
server. The browser never talks to those services: the server holds the metadata service's
admin key, and reaches plugins through the source contract.

## Where things are

| Page | What | Shown when |
|---|---|---|
| Admin → Jobs | The server's own jobs | always |
| Admin → Metadata | The metadata service: connection and health, providers and their sync runs, duplicates and the decision model, search engine, jobs, network | always |
| A catalogue entry | Refresh from providers (admins) | always |
| Admin → Plugins → a plugin → Extensions | Its stores (refresh) and packages (install, update, reload) | the plugin has `packages` |
| Admin → Plugins → a plugin → Sources | Its sources' health checks: results, scheduled checks on or off, Check now | the plugin has `health_checks` (Check now also needs `jobs`) |
| Admin → Plugins → a plugin → Extensions → an extension | Image retries for all its sources | the plugin has `packages` |
| A source's settings (Admin → Sources, a source's page, an extension's details) | Its own image retries, overriding its extension's | always |
| Admin → Plugins → a plugin → Jobs | Its jobs | the plugin has `jobs` |
| Admin → Plugins → a plugin → Network | Its network profiles, proxies and solvers | always |
| Admin → System | The server's health, and the metadata service in a line | always |

A plugin's tabs follow its capabilities, so a plugin that can't do something never shows an
empty section for it. The server still checks every call: a plugin without `jobs` answers
`422 no_jobs`, a turned-off plugin `409 plugin_disabled`.

## One Jobs view for every service

The server, the metadata service and plugins share one job and run model: a job has a
schedule, parameters and runs; a run has a status, counts, notes and progress. So one set of
screens (`src/features/jobs/`) serves all three:

- **`JobsService`** (`service.ts`) says where a service's jobs are: the paths for the list, a
  job, its runs, a run, starting and cancelling. `serverJobs`, `metaJobs` and
  `pluginJobs(id, name)` are the three.
- **`JobsHost`** (`use-jobs.ts`) adds where the host page shows a job and a run. The server's
  jobs have their own routes (`/admin/jobs/$jobId/runs/$runId`); the others live in a tab and
  keep the job and run in the page's search (`?tab=jobs&job=…&run=…&status=…`), so a link to a
  run works and Back goes where you'd expect.
- **`JobList`, `JobView`, `RunView`** (`jobs-views.tsx`) are the screens; `JobsSection` picks one
  from the search for a tab.

How runs stay live differs, and the service says which:

- The **server** sends `job.*` events. They refresh its job queries, and progress events update
  a run in place.
- The **metadata service and plugins** send none, so the app polls: a running run every 2 s,
  the job list and a running job's runs every 5 s. Polling stops when nothing runs.

A job the service can't run now carries a `disabled_reason` (e.g. the metadata service's index
jobs while the database searches directly, or a plugin's sync with nothing configured). The
service decides; the app shows the reason, disables Run now, and shows the schedule as paused
(it stays as configured, but doesn't fire). Such a job is never offered for "Check now". If it
becomes disabled after the page loaded, starting it answers `409 job_disabled` and the app says
why and shows the job as it is now.

Starting a job that is already running answers `409 already_running` with the run that is
going. The server and the metadata service name it in `current_run_id`; a plugin in
`current_run`, with its own ID. Either way the app offers to watch that run.

Schedules are an interval or, for the connected services, cron, which runs in the schedule's
`time_zone` (an IANA name; the metadata service's is UTC). Cron is shown in words where it's a
common form ("daily at 03:00 UTC", "every Monday at 04:30 UTC", "every 15 minutes"), otherwise as
written ("on schedule 0 3,15 * * * (UTC)"). A zone named in the expression (`CRON_TZ=…`) counts
too; without either, the text says it's the service's own time zone rather than guess.

## The metadata service's providers

Each provider shows its plugin, health, record count, its sync schedules (from the service's
configuration, read-only) and its last runs. "Start a full sync" and "Sync changes" start one
kind; the card, a provider's runs (`?tab=providers&provider=…`) and a run in full (`&sync=…`)
poll while a sync runs, like the jobs. Provider syncs also appear as jobs
(`sync.<provider>.<kind>`) on the Jobs tab; the sync runs have the richer counts and notices.

## Checking one source now

There is no "check this source" call: a source's health is checked by one of its plugin's jobs.
A job that declares a `source_ids` parameter (a string list) is a **per-source job**
(contracts/jobs.md), so the Sources tab offers "Check now" on each source by running it with
that source's ID. Nothing depends on a plugin's job IDs:

- the jobs that take `source_ids` are the candidates;
- health checks come first: a job whose group or name says "health";
- one left gives a plain "Check now", several a small menu.

Sources that aren't there now (a language turned off, gone from the plugin) are hidden, as on
Admin → Sources, behind "Show hidden". The row then follows the run (by polling, as above) and shows the source's new health when it
ends, with a link to watch the run on the Jobs tab.

## Duplicates

The metadata service pairs up catalogue entries it suspects are one work. The Duplicates tab
lists the pairs to review, most alike first (filters in the URL: `show`, `min` in percent,
`judged`), and a pair side by side with why they look alike and, when the decision model is on,
its verdict. **Merge** can't be undone (the other entry's records move over and its ID points to
the one that stays), so it asks first and lets the admin pick which stays; **Different works**
keeps them apart, with a note, and can be taken back.

The decision model's settings (on or off, the kind of service, URL, model, API key, covers) are
saved in the metadata service and win over its configuration until reset. The key is write-only:
the form says a key is saved and an empty field keeps it. "Test" asks the model about a made-up
pair with the settings in the form, without saving them.

## Search engine

The Search tab says which engine answers searches now, what it can do (typos, parts of words,
filter counts), and, for an external engine, how its index is doing: entries in it, when it was
built, changes waiting and how old the oldest is, errors. A backlog is polled while it drains.
**Rebuild the index** runs the service's own `search-rebuild` job (and links to it on the Jobs
tab); it's offered only when the service has that job.

The built-in backend is the database itself, with no separate index: the status's `ready` and
`reachable` describe an engine and don't apply to it, so it is healthy unless searches fell
back (`degraded`), and shows no index figures or rebuild.

Its settings (the engine, its URL, a write-only API key, an index prefix, who serves browsing)
work like the decision model's: they win over the service's configuration until reset, "Test"
checks them without saving, and the service talks to the engine, never the browser. Changing
the engine wants a rebuild.

## Image retries

A page image that fails for a reason worth retrying (a timeout, a 5xx, a dropped connection)
is tried again by the server, before the reader shows Try again; downloads get the same. How
many times, and after which waits, is set at two levels: an extension (for all its sources)
and one source. A source uses its own setting, else its extension's, else the server's default
(2 more attempts, after 1 s then 3 s).

Each level has three states, and the control keeps them apart because they mean different
things:

- **Inherit:** nothing set here (`DELETE`); the option says what that gives ("As its
  extension: …" or "Default: …").
- **Off:** retries turned off at this level (`[]`), which a source can do even when its
  extension retries.
- **Waits of its own:** up to 5 waits of 0–30 s, one per extra attempt. Choosing it starts
  from what's in effect, so a tweak starts there.

Under the control, one line says what's in effect and where it comes from (set here, from its
extension, the default). Saving an extension refreshes what its sources show as inherited.
