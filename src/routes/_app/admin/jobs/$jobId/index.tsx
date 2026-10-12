// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SERVER_JOBS } from "@/features/jobs/hosts";
import type { RunStatus } from "@/features/jobs/jobs";
import { JobView, RUN_STATUSES } from "@/features/jobs/jobs-views";
import { JobsContext } from "@/features/jobs/use-jobs";

export const Route = createFileRoute("/_app/admin/jobs/$jobId/")({
  validateSearch: (search: Record<string, unknown>): { status?: RunStatus } =>
    RUN_STATUSES.includes(search.status as RunStatus) ? { status: search.status as RunStatus } : {},
  component: JobPage,
});

function JobPage() {
  const { jobId } = Route.useParams();
  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <JobsContext value={SERVER_JOBS}>
      <JobView
        jobId={jobId}
        status={status}
        onStatus={(next) => void navigate({ search: next ? { status: next } : {}, replace: true })}
      />
    </JobsContext>
  );
}
