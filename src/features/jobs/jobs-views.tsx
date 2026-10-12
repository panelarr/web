// SPDX-License-Identifier: GPL-3.0-or-later

import { Link, type LinkOptions } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { defaultsText, duration, type Job, RUN_STATUS, type RunStatus, scheduleText, triggerText } from "./jobs";
import { CancelRunButton, RunJobButton } from "./run-job";
import { ProgressLine, RunStatusBadge } from "./run-status";
import { useJob, useJobList, useJobRuns, useJobsHost, useRun } from "./use-jobs";

export const RUN_STATUSES = Object.keys(RUN_STATUS) as RunStatus[];

/** Every job of the host's service, by group, each with its schedule, last run and Run now. */
export function JobList() {
  const { nested } = useJobsHost();
  const jobs = useJobList();
  const groups = new Map<string, Job[]>();
  for (const job of jobs.data?.jobs ?? [])
    groups.set(job.group || "Other", [...(groups.get(job.group || "Other") ?? []), job]);
  const Heading = nested ? "h3" : "h2";
  return (
    <>
      {jobs.error ? <ErrorAlert error={jobs.error} onRetry={() => void jobs.refetch()} /> : null}
      {jobs.isPending ? <Loading /> : null}
      {jobs.data?.jobs.length === 0 ? <EmptyState icon={<Clock />} title="No jobs" /> : null}
      <div className="grid gap-8">
        {[...groups.entries()].map(([group, list]) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            {/* Services name groups as they like ("health"); headings start with a capital. */}
            <Heading id={`group-${group}`} className="mb-3 text-lg font-semibold">
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </Heading>
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
  const { links, nested, service } = useJobsHost();
  const current = useRun(job.running ? job.current_run_id : undefined);
  const last = job.last_run;
  return (
    <Card>
      <CardHeader>
        <CardTitle as={nested ? "h4" : "h3"} className="[overflow-wrap:anywhere]">
          {job.name}
        </CardTitle>
        <CardDescription>{job.description}</CardDescription>
        <CardAction>
          <Link
            {...links.job(job.id)}
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
                <Link {...links.run(job.id, job.current_run_id)} className="text-xs underline underline-offset-4">
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
              {formatRelative(last.finished_at ?? last.started_at)} {triggerText(last.trigger, service.owner)}
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

function BackLink({ link, children }: { link: LinkOptions; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
      <Link {...link}>
        <ArrowLeft aria-hidden />
        {children}
      </Link>
    </Button>
  );
}

/** One job: what it does, how it's scheduled, and its runs (filtered by status). */
export function JobView({
  jobId,
  status,
  onStatus,
}: {
  jobId: string;
  status: RunStatus | undefined;
  onStatus: (status: RunStatus | undefined) => void;
}) {
  const { links, nested, service } = useJobsHost();
  const job = useJob(jobId);
  const runs = useJobRuns(jobId, status, job.data?.running ?? false);
  const list = runs.data?.pages.flatMap((page) => page.runs) ?? [];
  const Heading = nested ? "h3" : "h2";

  return (
    <>
      {/* Inside a tab, "Jobs" would read like the server's own (in the admin menu). */}
      <BackLink link={links.list}>{nested ? "All jobs" : "Jobs"}</BackLink>
      {job.error ? <ErrorAlert error={job.error} onRetry={() => void job.refetch()} /> : null}
      {job.data ? (
        <PageHeader
          level={nested ? 2 : 1}
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
        <Heading className="text-lg font-semibold">Runs</Heading>
        <div className="w-44">
          <NativeSelect
            aria-label="Status"
            value={status ?? ""}
            onChange={(e) => onStatus(e.target.value ? (e.target.value as RunStatus) : undefined)}
          >
            <option value="">Every status</option>
            {RUN_STATUSES.map((s) => (
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
              <Link {...links.run(jobId, run.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <RunStatusBadge status={run.status} />
                    <span className="text-sm" title={formatDateTime(run.started_at)}>
                      {formatRelative(run.started_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {triggerText(run.trigger, service.owner)}
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

/** One run in full: outcome, counts, parameters, notes, and progress while it runs. */
export function RunView({ jobId, runId }: { jobId: string; runId: string }) {
  const { links, nested, service } = useJobsHost();
  const job = useJob(jobId);
  const run = useRun(runId);
  const summary = run.data?.summary;
  const cardTitle = nested ? "h3" : "h2";
  return (
    <>
      <BackLink link={links.job(jobId)}>{job.data?.name ?? "Job"}</BackLink>
      {run.error ? <ErrorAlert error={run.error} onRetry={() => void run.refetch()} /> : null}
      {run.isPending ? <Loading /> : null}
      {run.data && summary ? (
        <>
          <PageHeader
            level={nested ? 2 : 1}
            title={
              <span className="flex flex-wrap items-center gap-3">
                Run <RunStatusBadge status={summary.status} className="text-sm" />
              </span>
            }
            description={`Started ${formatDateTime(summary.started_at)} ${triggerText(summary.trigger, service.owner)}${
              summary.triggered_by ? ` by ${summary.triggered_by}` : ""
            } · ${duration(summary.started_at, summary.finished_at)}`}
            actions={
              summary.status === "running" && job.data?.cancellable ? (
                <CancelRunButton runId={runId} label="Cancel run" />
              ) : null
            }
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="grid content-start gap-6">
              {run.data.progress ? (
                <Card>
                  <CardHeader>
                    <CardTitle as={cardTitle}>Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProgressLine progress={run.data.progress} />
                  </CardContent>
                </Card>
              ) : null}
              <Card>
                <CardHeader>
                  <CardTitle as={cardTitle}>Outcome</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <p className="[overflow-wrap:anywhere]">
                    {summary.message || (summary.status === "running" ? "Still running…" : "No message.")}
                  </p>
                  <KeyValues title="Counts" values={summary.counts} />
                  <KeyValues title="Parameters" values={run.data.params} empty="Defaults" />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle as={cardTitle}>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {run.data.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing notable.</p>
                ) : (
                  <ol className="grid gap-2">
                    {run.data.notes.map((note, i) => (
                      <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                        <Badge
                          variant="outline"
                          className={cn(
                            "self-start",
                            note.level === "error" && "border-destructive/50 text-destructive",
                            note.level === "warn" && "border-warning/50 text-warning",
                          )}
                        >
                          {note.level}
                        </Badge>
                        <span className="[overflow-wrap:anywhere]">{note.message}</span>
                        <span className="col-start-2 text-xs text-muted-foreground">
                          {formatDateTime(note.at)}
                          {note.ref ? ` · ${note.ref}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

function KeyValues({
  title,
  values,
  empty,
}: {
  title: string;
  values: Record<string, string | number>;
  empty?: string;
}) {
  const { nested } = useJobsHost();
  const Heading = nested ? "h4" : "h3";
  const entries = Object.entries(values);
  if (entries.length === 0 && !empty) return null;
  return (
    <div>
      <Heading className="mb-1 text-xs font-medium text-muted-foreground">{title}</Heading>
      {entries.length === 0 ? (
        <p className="text-sm">{empty}</p>
      ) : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt>
              <dd className="tabular-nums [overflow-wrap:anywhere]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A job and a run picked in a host page's search (a tab's own pages: ?job=…&run=…&status=…). */
export interface JobsSearch {
  job?: string;
  run?: string;
  status?: RunStatus;
}

export function jobsSearch(search: Record<string, unknown>): JobsSearch {
  const out: JobsSearch = {};
  if (typeof search.job === "string" && search.job) out.job = search.job;
  if (out.job && typeof search.run === "string" && search.run) out.run = search.run;
  if (RUN_STATUSES.includes(search.status as RunStatus)) out.status = search.status as RunStatus;
  return out;
}

/** The jobs of a service inside another page: the list, one job's runs, or one run. */
export function JobsSection({
  search,
  onStatus,
}: {
  search: JobsSearch;
  onStatus: (status: RunStatus | undefined) => void;
}) {
  if (search.job && search.run) return <RunView jobId={search.job} runId={search.run} />;
  if (search.job) return <JobView jobId={search.job} status={search.status} onStatus={onStatus} />;
  return <JobList />;
}
