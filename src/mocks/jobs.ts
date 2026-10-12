// SPDX-License-Identifier: GPL-3.0-or-later

// The mock server's jobs and task queue, with runs that progress over time and send the
// same events the server does.
import type { components } from "@/api/schema.gen";
import { adminUser } from "./data";
import { emit } from "./events";
import { searchRebuilt } from "./meta";

type S = components["schemas"];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export function initialJobs(): S["Job"][] {
  return [
    {
      id: "update-check",
      name: "Check for new chapters",
      description: "Asks every attached source for new chapters of the works in libraries.",
      group: "Library",
      schedule: { interval_seconds: 21_600, enabled: true, source: "PANELARR_UPDATE_INTERVAL" },
      running: false,
      next_run_at: minutesFromNow(95),
      cancellable: true,
      params: [
        {
          name: "force",
          type: "bool",
          description: "Also check works checked in the last hour.",
          required: false,
          default: "false",
        },
      ],
    },
    {
      id: "match-works",
      name: "Match works on sources",
      description: "Searches sources again for works with missing or weak matches.",
      group: "Library",
      schedule: { enabled: false },
      running: false,
      cancellable: true,
      params: [
        {
          name: "only_unmatched",
          type: "bool",
          description: "Skip works matched on every source.",
          required: false,
          default: "true",
        },
        {
          name: "sources",
          type: "string_list",
          description: "Only these sources.",
          required: false,
          choices: ["example:1001", "example:1002", "example:1003"],
        },
      ],
    },
    {
      id: "sources.sync",
      name: "Refresh sources",
      description: "Asks each plugin for its sources and their health.",
      group: "Sources",
      schedule: { interval_seconds: 300, enabled: true, source: "PANELARR_SOURCES_SYNC_INTERVAL" },
      running: false,
      next_run_at: minutesFromNow(3),
      cancellable: false,
      params: [],
    },
    {
      id: "cleanup",
      name: "Clean up",
      description: "Removes expired sessions, used invites and old job runs.",
      group: "Maintenance",
      schedule: { interval_seconds: 86_400, enabled: false, source: "PANELARR_CLEANUP_INTERVAL" },
      running: false,
      cancellable: false,
      params: [
        { name: "keep_days", type: "int", description: "Keep runs this many days.", required: true, default: "30" },
      ],
    },
  ];
}

function run(
  job_id: string,
  status: S["JobRunStatus"],
  trigger: S["JobRunSummary"]["trigger"],
  ago: number,
  message: string,
  counts: Record<string, number>,
  notes: S["JobRunNote"][] = [],
): S["JobRun"] {
  return {
    summary: {
      id: crypto.randomUUID(),
      job_id,
      status,
      trigger,
      started_at: minutesAgo(ago),
      finished_at: minutesAgo(ago - 1),
      message,
      counts,
      ...(trigger === "manual" ? { triggered_by: adminUser.username } : {}),
    },
    params: {},
    notes,
  };
}

export function initialRuns(): S["JobRun"][] {
  return [
    run("update-check", "succeeded", "schedule", 265, "Checked 42 works, 7 new chapters", {
      works: 42,
      new_chapters: 7,
    }),
    run("update-check", "failed", "schedule", 625, "2 sources failed", { works: 40, failed: 2 }, [
      { at: minutesAgo(624), level: "warn", message: "Sample Scans answered 503", ref: "example:1002" },
      { at: minutesAgo(624), level: "error", message: "Gave up after 3 tries", ref: "example:1002" },
    ]),
    run("update-check", "skipped", "schedule", 985, "Still running from before", {}),
    run("match-works", "succeeded", "manual", 1440, "Matched 3 of 5 works", { works: 5, matched: 3 }),
    run("sources.sync", "succeeded", "schedule", 2, "3 sources, 1 failing", { sources: 3, failing: 1 }),
    run("cleanup", "succeeded", "startup", 3000, "Removed 12 sessions", { sessions: 12 }),
  ].map((r) => r);
}

export function initialTasks(): S["Task"][] {
  const base = { priority: 0, max_attempts: 5, created_by: adminUser.id };
  return [
    {
      ...base,
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      kind: "download.chapter",
      state: "running",
      attempts: 1,
      run_after: minutesAgo(3),
      progress: { phase: "pages", done: 7, total: 22, unit: "pages" },
      limit_key: "source:example:1001",
      payload: { work_title: "The Lantern Keeper", chapter: "12" },
      created_at: minutesAgo(4),
      started_at: minutesAgo(3),
    },
    {
      ...base,
      id: "a1b2c3d4-0000-4000-8000-000000000002",
      kind: "download.chapter",
      state: "queued",
      attempts: 0,
      run_after: minutesAgo(3),
      limit_key: "source:example:1001",
      payload: { work_title: "The Lantern Keeper", chapter: "13" },
      created_at: minutesAgo(4),
    },
    {
      ...base,
      id: "a1b2c3d4-0000-4000-8000-000000000003",
      kind: "match.work",
      state: "failed",
      attempts: 5,
      run_after: minutesAgo(30),
      last_error: "Sample Scans timed out",
      limit_key: "source:example:1002",
      payload: { work_title: "Moonlit Bakery" },
      created_at: minutesAgo(90),
      started_at: minutesAgo(31),
      finished_at: minutesAgo(30),
    },
    {
      ...base,
      id: "a1b2c3d4-0000-4000-8000-000000000004",
      kind: "update.work",
      state: "succeeded",
      attempts: 1,
      run_after: minutesAgo(60),
      payload: { work_title: "Iron Garden" },
      created_at: minutesAgo(61),
      started_at: minutesAgo(60),
      finished_at: minutesAgo(60),
    },
  ];
}

export const QUEUE_CONCURRENCY: Record<string, number> = { "download.chapter": 2, "match.work": 4, "update.work": 4 };

/** One service's jobs and their runs. Only the server's send events; meta's and plugins' are polled. */
export interface JobStore {
  jobs: S["Job"][];
  runs: S["JobRun"][];
  quiet?: boolean;
}

export interface JobsState extends JobStore {
  tasks: S["Task"][];
  /** For plugins' per-source jobs (health checks), which update their sources when done. */
  sources: S["SourceInfo"][];
  /** For meta's search-rebuild, which brings the index up to date. */
  searchEngine: S["MetaSearchEngine"];
  pausedKinds: string[];
  metaJobs: JobStore;
  /** By plugin ID, for plugins with the `jobs` capability. */
  pluginJobs: Record<string, JobStore>;
}

const RUN_STEPS = 5;

/** Starts a run of `job` and tells admins (when its service sends events). */
export function startRun(
  state: JobStore,
  job: S["Job"],
  params: Record<string, string>,
  trigger: S["JobRunSummary"]["trigger"],
  by?: string,
): S["JobRun"] {
  const started: S["JobRun"] = {
    summary: {
      id: crypto.randomUUID(),
      job_id: job.id,
      status: "running",
      trigger,
      started_at: new Date().toISOString(),
      message: "",
      counts: {},
      ...(by ? { triggered_by: by } : {}),
    },
    params,
    notes: [],
    progress: { phase: "working", done: 0, total: RUN_STEPS, unit: "steps" },
  };
  state.runs.unshift(started);
  job.running = true;
  job.current_run_id = started.summary.id;
  if (!state.quiet) emit("job.started", { job_id: job.id, run_id: started.summary.id });
  return started;
}

/** Ends a run (succeeded, failed or cancelled) and tells admins (when its service sends events). */
export function finishRun(state: JobStore, current: S["JobRun"], status: S["JobRunStatus"], message: string): void {
  current.summary = { ...current.summary, status, message, finished_at: new Date().toISOString() };
  delete current.progress;
  const job = state.jobs.find((j) => j.id === current.summary.job_id);
  if (job) {
    job.running = false;
    delete job.current_run_id;
    job.last_run = current.summary;
  }
  if (state.quiet) return;
  emit(status === "failed" ? "job.failed" : "job.done", {
    job_id: current.summary.job_id,
    run_id: current.summary.id,
    status,
  });
}

/** Moves every running run of every service one step on (the browser calls it on a timer; tests call it by hand). */
export function tickJobs(state: JobsState): boolean {
  let changed = false;
  for (const store of [state, state.metaJobs, ...Object.values(state.pluginJobs)]) {
    for (const current of store.runs.filter((r) => r.summary.status === "running" && r.progress)) {
      const progress = current.progress as S["JobProgress"];
      const done = progress.done + 1;
      changed = true;
      if (done >= (progress.total ?? RUN_STEPS)) {
        if (current.summary.job_id === "source-health") {
          const checked = checkSources(state, current.params.source_ids);
          current.summary.counts = { checked: checked.length, failing: checked.filter(failing).length };
          finishRun(
            store,
            current,
            "succeeded",
            `${checked.length} checked, ${checked.filter(failing).length} failing`,
          );
        } else if (store === state.metaJobs && current.summary.job_id === "search-rebuild") {
          searchRebuilt(state.searchEngine);
          current.summary.counts = { entries: 48_210 };
          finishRun(store, current, "succeeded", "Indexed 48210 entries");
        } else {
          current.summary.counts = { works: 12, new_chapters: 3 };
          finishRun(store, current, "succeeded", "Done: 12 works, 3 new chapters");
        }
      } else {
        current.progress = { ...progress, done };
        if (!store.quiet)
          emit("job.progress", {
            job_id: current.summary.job_id,
            run_id: current.summary.id,
            progress: current.progress,
          });
      }
    }
  }
  return changed;
}

const failing = (source: S["SourceInfo"]) => source.health.status === "failing";

/** A health check of some of the store plugin's sources (all when none are named): they all answer. */
function checkSources(state: JobsState, ids: string | undefined): S["SourceInfo"][] {
  const wanted = ids ? ids.split(",") : undefined;
  const checked = state.sources.filter(
    (s) => s.plugin_id === "stores" && s.present && (wanted ? wanted.includes(s.id) : !s.health.checks_disabled),
  );
  for (const source of checked) {
    source.health = {
      status: "ok",
      checked_at: new Date().toISOString(),
      ...(source.health.checks_disabled ? { checks_disabled: true } : {}),
    };
  }
  return checked;
}

/** Each job's last run, from the newest run of it. */
function withLastRuns(store: JobStore): JobStore {
  for (const job of store.jobs) {
    const last = store.runs.find((r) => r.summary.job_id === job.id);
    if (last) job.last_run = last.summary;
  }
  return store;
}

/** The metadata service's jobs: a sync per provider and kind, the search index, duplicates. */
export function initialMetaJobs(): JobStore {
  const force: S["JobParam"] = {
    name: "force",
    type: "bool",
    description: "Ingest everything again, even what hasn't changed.",
    required: false,
    default: "false",
  };
  return withLastRuns({
    quiet: true,
    jobs: [
      {
        id: "sync.example-provider.dump",
        name: "Example Provider: full sync",
        description: "Downloads the provider's whole catalogue and merges it in.",
        group: "Providers",
        schedule: { cron: "0 3 * * *", time_zone: "UTC", enabled: true, source: "META_SYNC_DUMP_SCHEDULE" },
        running: false,
        next_run_at: minutesFromNow(3 * 1440),
        cancellable: true,
        params: [force],
      },
      {
        id: "sync.example-provider.delta",
        name: "Example Provider: changes",
        description: "Fetches what changed at the provider since the last sync.",
        group: "Providers",
        schedule: { interval_seconds: 3_600, enabled: true, source: "META_SYNC_DELTA_INTERVAL" },
        running: false,
        next_run_at: minutesFromNow(40),
        cancellable: true,
        params: [force],
      },
      {
        id: "search-rebuild",
        name: "Rebuild the search index",
        description: "Indexes every catalogue entry again, from scratch.",
        group: "Search",
        schedule: { enabled: false },
        running: false,
        cancellable: true,
        params: [],
      },
      {
        id: "duplicates-scan",
        name: "Look for duplicates",
        description: "Pairs up entries that look like the same work, for review.",
        group: "Maintenance",
        schedule: { cron: "30 4 * * 1", time_zone: "UTC", enabled: true, source: "META_DUPLICATES_SCHEDULE" },
        running: false,
        next_run_at: minutesFromNow(600),
        cancellable: false,
        params: [
          {
            name: "min_score",
            type: "int",
            description: "Only pairs scoring at least this (0–100).",
            required: false,
            default: "70",
          },
        ],
      },
    ],
    runs: [
      run("sync.example-provider.delta", "succeeded", "schedule", 20, "312 records, 4 merges", {
        upserts: 312,
        merges: 4,
      }),
      run("sync.example-provider.dump", "succeeded", "schedule", 4 * 1440, "48210 records", {
        upserts: 48_210,
        merges: 1_022,
      }),
      run("search-rebuild", "succeeded", "system", 2 * 1440, "Indexed 48210 entries", { entries: 48_210 }),
      run("duplicates-scan", "failed", "schedule", 840, "The judge didn't answer", { pairs: 0 }, [
        { at: minutesAgo(839), level: "error", message: "Judge timed out after 30 s", ref: "" },
      ]),
    ],
  });
}

/** A plugin's own jobs (the store plugin's): its stores and its sources' health checks. */
export function initialPluginJobs(): Record<string, JobStore> {
  return {
    stores: withLastRuns({
      quiet: true,
      jobs: [
        {
          id: "store-refresh",
          name: "Refresh stores",
          description: "Fetches every store's package list again.",
          group: "Stores",
          schedule: { interval_seconds: 21_600, enabled: true, source: "STORE_REFRESH_INTERVAL" },
          running: false,
          next_run_at: minutesFromNow(200),
          cancellable: false,
          params: [],
        },
        {
          id: "source-health",
          name: "Check sources",
          description: "Asks each source for a page of results to see that it works.",
          group: "health",
          schedule: { interval_seconds: 43_200, enabled: true, source: "SOURCE_HEALTH_INTERVAL" },
          running: false,
          next_run_at: minutesFromNow(500),
          cancellable: true,
          params: [
            {
              name: "source_ids",
              type: "string_list",
              description: "Only these sources (all when empty).",
              required: false,
            },
          ],
        },
      ],
      runs: [
        run("store-refresh", "succeeded", "schedule", 160, "2 stores, 5 updates", { stores: 2, updates: 5 }),
        run("source-health", "succeeded", "startup", 220, "1 source checked, all well", { checked: 1, failing: 0 }),
      ],
    }),
  };
}

export function queueState(state: JobsState): S["QueueState"] {
  const kinds = new Set([...Object.keys(QUEUE_CONCURRENCY), ...state.tasks.map((t) => t.kind)]);
  return {
    kinds: [...kinds].sort().map((kind) => {
      const tasks = state.tasks.filter((t) => t.kind === kind);
      return {
        kind,
        paused: state.pausedKinds.includes(kind),
        running: tasks.filter((t) => t.state === "running").length,
        concurrency: QUEUE_CONCURRENCY[kind] ?? 1,
        queued: tasks.filter((t) => t.state === "queued").length,
        failed: tasks.filter((t) => t.state === "failed").length,
      };
    }),
  };
}

/** A task event, as the server sends it. */
export function taskEvent(
  type: "task.queued" | "task.started" | "task.progress" | "task.updated",
  task: S["Task"],
): void {
  emit(type, {
    id: task.id,
    kind: task.kind,
    state: task.state,
    attempts: task.attempts,
    ...(task.last_error ? { last_error: task.last_error } : {}),
    ...(task.progress ? { progress: task.progress } : {}),
  });
}
