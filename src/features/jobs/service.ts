// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryKey } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import type { RunStatus } from "./jobs";

type S = components["schemas"];

export interface RunsQuery {
  page_size: number;
  page_token?: string;
  status?: RunStatus;
}

/**
 * Where a set of jobs lives: the server's own, the metadata service's (through the server) or a
 * plugin's. All three have the same job and run model (contracts/jobs.md), so one set of
 * screens serves them; only the paths and how runs stay live differ.
 */
export interface JobsService {
  /** Who runs the jobs, in words ("the server", "the metadata service", a plugin's name). */
  owner: string;
  /** The server tells us about its runs over the event stream; the others are polled while they run. */
  live: "events" | "poll";
  keys: {
    list: QueryKey;
    job: (jobId: string) => QueryKey;
    runs: (jobId: string, status?: RunStatus) => QueryKey;
    run: (runId: string) => QueryKey;
    /** True for every query of this service (to refresh them all after a change). */
    owns: (key: QueryKey) => boolean;
  };
  list: () => Promise<S["JobList"]>;
  job: (jobId: string) => Promise<S["Job"]>;
  runs: (jobId: string, query: RunsQuery) => Promise<S["JobRunList"]>;
  run: (runId: string) => Promise<S["JobRun"]>;
  start: (jobId: string, params: Record<string, string>) => Promise<S["JobRunSummary"]>;
  cancel: (runId: string) => Promise<S["JobRunSummary"]>;
}

/** The middleware throws on errors, so an answer without data is a bug, not a failure to show. */
function data<T>(result: { data?: T }): T {
  if (result.data === undefined) throw new Error("The server answered without data.");
  return result.data;
}

const body = (params: Record<string, string>) => (Object.keys(params).length > 0 ? { params } : {});
const runsQuery = ({ status, ...rest }: RunsQuery) => ({ ...rest, ...(status ? { status } : {}) });

// Keys are the ones `$api` would make for the same request ([method, path, init]), so the
// event stream's invalidations (by path) reach the server's.
const key = (path: string, init?: object): QueryKey => (init ? ["get", path, init] : ["get", path]);
const ownedBy =
  (...prefixes: string[]) =>
  (queryKey: QueryKey) =>
    typeof queryKey[1] === "string" && prefixes.some((prefix) => (queryKey[1] as string).startsWith(prefix));

export const serverJobs: JobsService = {
  owner: "the server",
  live: "events",
  keys: {
    list: key("/jobs"),
    job: (job_id) => key("/jobs/{job_id}", { params: { path: { job_id } } }),
    runs: (job_id, status) => key("/jobs/{job_id}/runs", { params: { path: { job_id } }, status }),
    run: (run_id) => key("/job-runs/{run_id}", { params: { path: { run_id } } }),
    owns: ownedBy("/jobs", "/job-runs"),
  },
  list: async () => data(await api.GET("/jobs")),
  job: async (job_id) => data(await api.GET("/jobs/{job_id}", { params: { path: { job_id } } })),
  runs: async (job_id, query) =>
    data(await api.GET("/jobs/{job_id}/runs", { params: { path: { job_id }, query: runsQuery(query) } })),
  run: async (run_id) => data(await api.GET("/job-runs/{run_id}", { params: { path: { run_id } } })),
  start: async (job_id, params) =>
    data(await api.POST("/jobs/{job_id}/run", { params: { path: { job_id } }, body: body(params) })),
  cancel: async (run_id) => data(await api.POST("/job-runs/{run_id}/cancel", { params: { path: { run_id } } })),
};

export const metaJobs: JobsService = {
  owner: "the metadata service",
  live: "poll",
  keys: {
    list: key("/system/meta/jobs"),
    job: (job_id) => key("/system/meta/jobs/{job_id}", { params: { path: { job_id } } }),
    runs: (job_id, status) => key("/system/meta/jobs/{job_id}/runs", { params: { path: { job_id } }, status }),
    run: (run_id) => key("/system/meta/job-runs/{run_id}", { params: { path: { run_id } } }),
    owns: ownedBy("/system/meta/jobs", "/system/meta/job-runs"),
  },
  list: async () => data(await api.GET("/system/meta/jobs")),
  job: async (job_id) => data(await api.GET("/system/meta/jobs/{job_id}", { params: { path: { job_id } } })),
  runs: async (job_id, query) =>
    data(await api.GET("/system/meta/jobs/{job_id}/runs", { params: { path: { job_id }, query: runsQuery(query) } })),
  run: async (run_id) => data(await api.GET("/system/meta/job-runs/{run_id}", { params: { path: { run_id } } })),
  start: async (job_id, params) =>
    data(await api.POST("/system/meta/jobs/{job_id}/run", { params: { path: { job_id } }, body: body(params) })),
  cancel: async (run_id) =>
    data(await api.POST("/system/meta/job-runs/{run_id}/cancel", { params: { path: { run_id } } })),
};

/** A plugin's jobs (plugins with the `jobs` capability). Their run IDs are the plugin's own strings. */
export function pluginJobs(plugin_id: string, name: string): JobsService {
  return {
    owner: name,
    live: "poll",
    keys: {
      list: key("/plugins/{plugin_id}/jobs", { params: { path: { plugin_id } } }),
      job: (job_id) => key("/plugins/{plugin_id}/jobs/{job_id}", { params: { path: { plugin_id, job_id } } }),
      runs: (job_id, status) =>
        key("/plugins/{plugin_id}/jobs/{job_id}/runs", { params: { path: { plugin_id, job_id } }, status }),
      run: (run_id) => key("/plugins/{plugin_id}/job-runs/{run_id}", { params: { path: { plugin_id, run_id } } }),
      owns: (queryKey) =>
        ownedBy("/plugins/{plugin_id}/jobs", "/plugins/{plugin_id}/job-runs")(queryKey) &&
        (queryKey[2] as { params?: { path?: { plugin_id?: string } } } | undefined)?.params?.path?.plugin_id ===
          plugin_id,
    },
    list: async () => data(await api.GET("/plugins/{plugin_id}/jobs", { params: { path: { plugin_id } } })),
    job: async (job_id) =>
      data(await api.GET("/plugins/{plugin_id}/jobs/{job_id}", { params: { path: { plugin_id, job_id } } })),
    runs: async (job_id, query) =>
      data(
        await api.GET("/plugins/{plugin_id}/jobs/{job_id}/runs", {
          params: { path: { plugin_id, job_id }, query: runsQuery(query) },
        }),
      ),
    run: async (run_id) =>
      data(await api.GET("/plugins/{plugin_id}/job-runs/{run_id}", { params: { path: { plugin_id, run_id } } })),
    start: async (job_id, params) =>
      data(
        await api.POST("/plugins/{plugin_id}/jobs/{job_id}/run", {
          params: { path: { plugin_id, job_id } },
          body: body(params),
        }),
      ),
    cancel: async (run_id) =>
      data(
        await api.POST("/plugins/{plugin_id}/job-runs/{run_id}/cancel", { params: { path: { plugin_id, run_id } } }),
      ),
  };
}
