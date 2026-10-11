// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { $api } from "@/api/client";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { defaultsText, RUN_STATUS, type RunStatus, scheduleText, TRIGGERS } from "@/features/jobs/jobs";
import { CancelRunButton, RunJobButton } from "@/features/jobs/run-job";
import { RunStatusBadge } from "@/features/jobs/run-status";
import { formatDateTime, formatRelative } from "@/lib/format";

const STATUSES = Object.keys(RUN_STATUS) as RunStatus[];

export const Route = createFileRoute("/_app/admin/jobs/$jobId/")({
  validateSearch: (search: Record<string, unknown>): { status?: RunStatus } =>
    STATUSES.includes(search.status as RunStatus) ? { status: search.status as RunStatus } : {},
  component: JobPage,
});

function JobPage() {
  const { jobId } = Route.useParams();
  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const job = $api.useQuery("get", "/jobs/{job_id}", { params: { path: { job_id: jobId } } });
  const runs = $api.useInfiniteQuery(
    "get",
    "/jobs/{job_id}/runs",
    { params: { path: { job_id: jobId }, query: { page_size: 25, ...(status ? { status } : {}) } } },
    {
      initialPageParam: "",
      getNextPageParam: (last) => last.next_page_token || undefined,
      pageParamName: "page_token",
    },
  );
  const list = runs.data?.pages.flatMap((page) => page.runs) ?? [];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link to="/admin/jobs">
          <ArrowLeft aria-hidden />
          Jobs
        </Link>
      </Button>
      {job.error ? <ErrorAlert error={job.error} onRetry={() => void job.refetch()} /> : null}
      {job.data ? (
        <PageHeader
          title={job.data.name}
          description={
            <>
              {job.data.description}
              <span className="mt-1 block text-xs">
                {[
                  scheduleText(job.data.schedule),
                  job.data.schedule.source ? `set by ${job.data.schedule.source}` : undefined,
                  defaultsText(job.data.params),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          }
          actions={
            <>
              {job.data.running && job.data.cancellable && job.data.current_run_id ? (
                <CancelRunButton runId={job.data.current_run_id} />
              ) : null}
              <RunJobButton job={job.data} size="default" />
            </>
          }
        />
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Runs</h2>
        <div className="w-44">
          <NativeSelect
            aria-label="Status"
            value={status ?? ""}
            onChange={(e) =>
              void navigate({ search: e.target.value ? { status: e.target.value as RunStatus } : {}, replace: true })
            }
          >
            <option value="">Every status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RUN_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {runs.error ? <ErrorAlert error={runs.error} onRetry={() => void runs.refetch()} /> : null}
      {runs.isPending ? <Loading /> : null}
      {runs.data && list.length === 0 ? (
        <EmptyState title={status ? "No runs with this status" : "No runs yet"} />
      ) : null}
      {list.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((run) => (
            <li key={run.id}>
              <Link
                to="/admin/jobs/$jobId/runs/$runId"
                params={{ jobId, runId: run.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <RunStatusBadge status={run.status} />
                    <span className="text-sm" title={formatDateTime(run.started_at)}>
                      {formatRelative(run.started_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TRIGGERS[run.trigger] ?? run.trigger}
                      {run.triggered_by ? ` (${run.triggered_by})` : ""}
                    </span>
                  </p>
                  {run.message ? (
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{run.message}</p>
                  ) : null}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {runs.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={runs.isFetchingNextPage} onClick={() => void runs.fetchNextPage()}>
            {runs.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older runs
          </Button>
        </div>
      ) : null}
    </>
  );
}
