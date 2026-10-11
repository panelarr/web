// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Clock } from "lucide-react";
import { $api } from "@/api/client";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Job, scheduleText, TRIGGERS } from "@/features/jobs/jobs";
import { CancelRunButton, RunJobButton } from "@/features/jobs/run-job";
import { ProgressLine, RunStatusBadge } from "@/features/jobs/run-status";
import { useRun } from "@/features/jobs/use-run";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/admin/jobs/")({
  component: JobsPage,
});

function JobsPage() {
  const jobs = $api.useQuery("get", "/jobs");
  const groups = new Map<string, Job[]>();
  for (const job of jobs.data?.jobs ?? [])
    groups.set(job.group || "Other", [...(groups.get(job.group || "Other") ?? []), job]);
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Background work the server runs on a schedule or when asked. Updates live."
      />
      {jobs.error ? <ErrorAlert error={jobs.error} onRetry={() => void jobs.refetch()} /> : null}
      {jobs.isPending ? <Loading /> : null}
      {jobs.data?.jobs.length === 0 ? <EmptyState icon={<Clock />} title="No jobs" /> : null}
      <div className="grid gap-8">
        {[...groups.entries()].map(([group, list]) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2 id={`group-${group}`} className="mb-3 text-lg font-semibold">
              {group}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function JobCard({ job }: { job: Job }) {
  const current = useRun(job.running ? job.current_run_id : undefined);
  const last = job.last_run;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3" className="[overflow-wrap:anywhere]">
          {job.name}
        </CardTitle>
        <CardDescription>{job.description}</CardDescription>
        <CardAction>
          <Link
            to="/admin/jobs/$jobId"
            params={{ jobId: job.id }}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label={`${job.name}: runs`}
          >
            Runs
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-xs text-muted-foreground">
          {scheduleText(job.schedule)}
          {job.next_run_at && job.schedule.enabled ? ` · next ${formatRelative(job.next_run_at)}` : ""}
        </p>
        {job.running ? (
          <div className="grid gap-2 rounded-md border border-info/30 bg-info/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <RunStatusBadge status="running" />
              {job.current_run_id ? (
                <Link
                  to="/admin/jobs/$jobId/runs/$runId"
                  params={{ jobId: job.id, runId: job.current_run_id }}
                  className="text-xs underline underline-offset-4"
                >
                  Watch
                </Link>
              ) : null}
            </div>
            {current.data?.progress ? <ProgressLine progress={current.data.progress} /> : null}
          </div>
        ) : last ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <RunStatusBadge status={last.status} />
            <span className="text-xs text-muted-foreground">
              {formatRelative(last.finished_at ?? last.started_at)} {TRIGGERS[last.trigger] ?? ""}
            </span>
            {last.message ? <span className="basis-full text-xs [overflow-wrap:anywhere]">{last.message}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Hasn't run yet.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <RunJobButton job={job} />
          {job.running && job.cancellable && job.current_run_id ? <CancelRunButton runId={job.current_run_id} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
