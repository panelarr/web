// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListChecks, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ProgressLine, RunStatusBadge } from "@/features/jobs/run-status";
import { formatDateTime, formatRelative } from "@/lib/format";

type Task = components["schemas"]["Task"];
type TaskState = components["schemas"]["TaskState"];

const STATES: readonly TaskState[] = ["queued", "running", "succeeded", "failed", "cancelled"];
const STATE_LABELS: Record<TaskState, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

interface QueueSearch {
  kind?: string;
  state?: TaskState;
}

export const Route = createFileRoute("/_app/admin/queue")({
  validateSearch: (search: Record<string, unknown>): QueueSearch => ({
    ...(typeof search.kind === "string" && search.kind ? { kind: search.kind } : {}),
    ...(STATES.includes(search.state as TaskState) ? { state: search.state as TaskState } : {}),
  }),
  component: QueuePage,
});

function useInvalidateQueue() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "/queue" || q.queryKey[1] === "/tasks" });
}

function QueuePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queue = $api.useQuery("get", "/queue");
  const tasks = $api.useInfiniteQuery(
    "get",
    "/tasks",
    { params: { query: { page_size: 50, ...search } } },
    {
      initialPageParam: "",
      getNextPageParam: (last) => last.next_page_token || undefined,
      pageParamName: "page_token",
    },
  );
  const list = tasks.data?.pages.flatMap((page) => page.tasks) ?? [];
  const set = (change: QueueSearch) => void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  return (
    <>
      <PageHeader
        title="Queue"
        description="Work waiting and running: matching, update checks, downloads. Updates live."
      />
      {queue.error ? <ErrorAlert error={queue.error} onRetry={() => void queue.refetch()} /> : null}
      {queue.data ? (
        <ul className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queue.data.kinds.map((kind) => (
            <KindCard key={kind.kind} kind={kind} />
          ))}
        </ul>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <div className="grid grid-cols-2 gap-2 sm:w-96">
          <NativeSelect
            aria-label="Kind"
            value={search.kind ?? ""}
            onChange={(e) => set({ kind: e.target.value || undefined })}
          >
            <option value="">Every kind</option>
            {queue.data?.kinds.map((kind) => (
              <option key={kind.kind} value={kind.kind}>
                {kind.kind}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="State"
            value={search.state ?? ""}
            onChange={(e) => set({ state: (e.target.value || undefined) as TaskState | undefined })}
          >
            <option value="">Every state</option>
            {STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_LABELS[state]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {tasks.error ? <ErrorAlert error={tasks.error} onRetry={() => void tasks.refetch()} /> : null}
      {tasks.isPending ? <Loading /> : null}
      {tasks.data && list.length === 0 ? <EmptyState icon={<ListChecks />} title="No tasks" /> : null}
      {list.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      ) : null}
      {tasks.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={tasks.isFetchingNextPage} onClick={() => void tasks.fetchNextPage()}>
            {tasks.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older tasks
          </Button>
        </div>
      ) : null}
    </>
  );
}

function KindCard({ kind }: { kind: components["schemas"]["QueueKind"] }) {
  const invalidate = useInvalidateQueue();
  const update = $api.useMutation("patch", "/queue/kinds/{kind}", {
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{kind.kind}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {kind.running}/{kind.concurrency} running · {kind.queued} queued
          {kind.failed > 0 ? <span className="text-destructive"> · {kind.failed} failed</span> : null}
        </p>
        {kind.paused ? <p className="text-xs font-medium text-warning">Paused: queued tasks wait</p> : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ params: { path: { kind: kind.kind } }, body: { paused: !kind.paused } })}
      >
        {kind.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
        {kind.paused ? "Resume" : "Pause"}
      </Button>
    </li>
  );
}

/** A task's payload in a line: its simple values, e.g. "work_title: Iron Garden · chapter: 12". */
function payloadText(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 4)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
    .join(" · ");
}

function TaskRow({ task }: { task: Task }) {
  const invalidate = useInvalidateQueue();
  const path = { params: { path: { task_id: task.id } } };
  const options = { onSuccess: invalidate, onError: (error: unknown) => toast.error(errorMessage(error)) };
  const cancel = $api.useMutation("post", "/tasks/{task_id}/cancel", options);
  const retry = $api.useMutation("post", "/tasks/{task_id}/retry", options);
  const waiting = task.state === "queued" && Date.parse(task.run_after) > Date.now();
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RunStatusBadge status={task.state} />
        <span className="font-medium">{task.kind}</span>
        <span className="text-xs text-muted-foreground" title={formatDateTime(task.created_at)}>
          {formatRelative(task.created_at)} · try {task.attempts}/{task.max_attempts}
          {waiting ? ` · next try ${formatRelative(task.run_after)}` : ""}
        </span>
        <span className="ml-auto flex gap-2">
          {task.state === "queued" || task.state === "running" ? (
            <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(path)}>
              <X aria-hidden />
              Cancel
            </Button>
          ) : null}
          {task.state === "failed" || task.state === "cancelled" ? (
            <Button variant="ghost" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(path)}>
              <RotateCcw aria-hidden />
              Retry
            </Button>
          ) : null}
        </span>
      </div>
      {Object.keys(task.payload).length > 0 ? (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{payloadText(task.payload)}</p>
      ) : null}
      {task.state === "running" && task.progress ? <ProgressLine progress={task.progress} /> : null}
      {task.last_error ? <p className="text-xs text-destructive [overflow-wrap:anywhere]">{task.last_error}</p> : null}
      {task.limit_key ? <p className="text-xs text-muted-foreground">Limited by {task.limit_key}</p> : null}
    </li>
  );
}
