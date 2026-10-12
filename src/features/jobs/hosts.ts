// SPDX-License-Identifier: GPL-3.0-or-later

import { serverJobs } from "./service";
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
