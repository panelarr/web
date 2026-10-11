// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { $api } from "@/api/client";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TRIGGERS } from "@/features/jobs/jobs";
import { CancelRunButton } from "@/features/jobs/run-job";
import { ProgressLine, RunStatusBadge } from "@/features/jobs/run-status";
import { useRun } from "@/features/jobs/use-run";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/jobs/$jobId/runs/$runId")({
  component: RunPage,
});

function duration(from: string, to: string | undefined): string {
  const ms = (to ? Date.parse(to) : Date.now()) - Date.parse(from);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60
    ? `${s} s`
    : s < 3600
      ? `${Math.floor(s / 60)} min ${s % 60} s`
      : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function RunPage() {
  const { jobId, runId } = Route.useParams();
  const job = $api.useQuery("get", "/jobs/{job_id}", { params: { path: { job_id: jobId } } });
  const run = useRun(runId);
  const summary = run.data?.summary;
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link to="/admin/jobs/$jobId" params={{ jobId }}>
          <ArrowLeft aria-hidden />
          {job.data?.name ?? "Job"}
        </Link>
      </Button>
      {run.error ? <ErrorAlert error={run.error} onRetry={() => void run.refetch()} /> : null}
      {run.isPending ? <Loading /> : null}
      {run.data && summary ? (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-3">
                Run <RunStatusBadge status={summary.status} className="text-sm" />
              </span>
            }
            description={`Started ${formatDateTime(summary.started_at)} ${TRIGGERS[summary.trigger] ?? ""}${
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
                    <CardTitle>Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProgressLine progress={run.data.progress} />
                  </CardContent>
                </Card>
              ) : null}
              <Card>
                <CardHeader>
                  <CardTitle>Outcome</CardTitle>
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
                <CardTitle>Notes</CardTitle>
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
  const entries = Object.entries(values);
  if (entries.length === 0 && !empty) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
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
