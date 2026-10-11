// SPDX-License-Identifier: GPL-3.0-or-later

// The mock server's jobs and task queue, with runs that progress over time and send the
// same events the server does.
import type { components } from "@/api/schema.gen";
import { adminUser } from "./data";
import { emit } from "./events";

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

export interface JobsState {
  jobs: S["Job"][];
  runs: S["JobRun"][];
  tasks: S["Task"][];
  pausedKinds: string[];
}

const RUN_STEPS = 5;

/** Starts a run of `job` and tells admins. */
export function startRun(
  state: JobsState,
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
  emit("job.started", { job_id: job.id, run_id: started.summary.id });
  return started;
}

/** Ends a run (succeeded, failed or cancelled) and tells admins. */
export function finishRun(state: JobsState, current: S["JobRun"], status: S["JobRunStatus"], message: string): void {
  current.summary = { ...current.summary, status, message, finished_at: new Date().toISOString() };
  delete current.progress;
  const job = state.jobs.find((j) => j.id === current.summary.job_id);
  if (job) {
    job.running = false;
    delete job.current_run_id;
    job.last_run = current.summary;
  }
  emit(status === "failed" ? "job.failed" : "job.done", {
    job_id: current.summary.job_id,
    run_id: current.summary.id,
    status,
  });
}

/** Moves every running run one step on (the browser calls it on a timer; tests call it by hand). */
export function tickJobs(state: JobsState): boolean {
  let changed = false;
  for (const current of state.runs.filter((r) => r.summary.status === "running" && r.progress)) {
    const progress = current.progress as S["JobProgress"];
    const done = progress.done + 1;
    changed = true;
    if (done >= (progress.total ?? RUN_STEPS)) {
      current.summary.counts = { works: 12, new_chapters: 3 };
      finishRun(state, current, "succeeded", "Done: 12 works, 3 new chapters");
    } else {
      current.progress = { ...progress, done };
      emit("job.progress", { job_id: current.summary.job_id, run_id: current.summary.id, progress: current.progress });
    }
  }
  return changed;
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
