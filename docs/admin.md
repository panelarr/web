# Connected services in the admin

Panelarr's admin also runs the services it depends on: the metadata service and source plugins.
Everything an admin does in their own admin pages can be done from Panelarr's, through the
server. The browser never talks to those services: the server holds the metadata service's
admin key, and reaches plugins through the source contract.

## Where things are

| Page | What | Shown when |
|---|---|---|
| Admin → Jobs | The server's own jobs | always |
| Admin → Metadata | The metadata service: connection and health, providers and their sync runs, jobs, network | always |
| A catalogue entry | Refresh from providers (admins) | always |
| Admin → Plugins → a plugin → Extensions | Its stores (refresh) and packages (install, update, reload) | the plugin has `packages` |
| Admin → Plugins → a plugin → Sources | Its sources' health checks: results, scheduled checks on or off, Check now | the plugin has `health_checks` (Check now also needs `jobs`) |
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
