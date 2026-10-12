// SPDX-License-Identifier: GPL-3.0-or-later

import { metaJobs, pluginJobs, serverJobs } from "./service";
import type { JobsHost } from "./use-jobs";

/** The server's own jobs, on their own pages under Admin → Jobs. */
export const SERVER_JOBS: JobsHost = {
  service: serverJobs,
  nested: false,
  links: {
    list: { to: "/admin/jobs" },
    job: (jobId) => ({ to: "/admin/jobs/$jobId", params: { jobId } }),
    run: (jobId, runId) => ({ to: "/admin/jobs/$jobId/runs/$runId", params: { jobId, runId } }),
  },
};

/** A plugin's jobs, inside its page's Jobs tab (?tab=jobs&job=…&run=…). */
export function pluginJobsHost(pluginId: string, name: string): JobsHost {
  const to = "/admin/plugins/$pluginId";
  const params = { pluginId };
  return {
    service: pluginJobs(pluginId, name),
    nested: true,
    links: {
      list: { to, params, search: { tab: "jobs" } },
      job: (job) => ({ to, params, search: { tab: "jobs", job } }),
      run: (job, run) => ({ to, params, search: { tab: "jobs", job, run } }),
    },
  };
}

/** The metadata service's jobs, through the server, inside its page's Jobs tab (?tab=jobs&job=…&run=…). */
export const META_JOBS: JobsHost = {
  service: metaJobs,
  nested: true,
  links: {
    list: { to: "/admin/metadata", search: { tab: "jobs" } },
    job: (job) => ({ to: "/admin/metadata", search: { tab: "jobs", job } }),
    run: (job, run) => ({ to: "/admin/metadata", search: { tab: "jobs", job, run } }),
  },
};
