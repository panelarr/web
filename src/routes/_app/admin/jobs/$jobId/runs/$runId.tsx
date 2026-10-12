// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { SERVER_JOBS } from "@/features/jobs/hosts";
import { RunView } from "@/features/jobs/jobs-views";
import { JobsContext } from "@/features/jobs/use-jobs";

export const Route = createFileRoute("/_app/admin/jobs/$jobId/runs/$runId")({
  component: RunPage,
});

function RunPage() {
  const { jobId, runId } = Route.useParams();
  return (
    <JobsContext value={SERVER_JOBS}>
      <RunView jobId={jobId} runId={runId} />
    </JobsContext>
  );
}
