# Connected services in the admin

Panelarr's admin also runs the services it depends on: the metadata service and source plugins.
Everything an admin does in their own admin pages can be done from Panelarr's, through the
server. The browser never talks to those services: the server holds the metadata service's
admin key, and reaches plugins through the source contract.

## Where things are

| Page | What | Shown when |
|---|---|---|
| Admin → Jobs | The server's own jobs | always |
| Admin → Metadata | The metadata service: connection, jobs, network | always |
| Admin → Plugins → a plugin → Extensions | Its packages | the plugin has `packages` |
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
