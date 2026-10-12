// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/states";
import { SERVER_JOBS } from "@/features/jobs/hosts";
import { JobList } from "@/features/jobs/jobs-views";
import { JobsContext } from "@/features/jobs/use-jobs";

export const Route = createFileRoute("/_app/admin/jobs/")({
  component: JobsPage,
});

function JobsPage() {
  return (
    <JobsContext value={SERVER_JOBS}>
      <PageHeader
        title="Jobs"
        description="Background work the server runs on a schedule or when asked. Updates live."
      />
      <JobList />
    </JobsContext>
  );
}
