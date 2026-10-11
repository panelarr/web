// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useIsAdmin } from "@/auth/session";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ProgressLine, RunStatusBadge } from "@/features/jobs/run-status";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = components["schemas"]["DownloadItem"];
type TaskState = components["schemas"]["TaskState"];

const FILTERS: ReadonlyArray<[TaskState | undefined, string]> = [
  [undefined, "All"],
  ["running", "Downloading"],
  ["queued", "Queued"],
  ["failed", "Failed"],
  ["succeeded", "Done"],
  ["cancelled", "Cancelled"],
];
const KIND = "download.chapter";

interface DownloadsSearch {
  state?: TaskState;
  everyone?: true;
}

export const Route = createFileRoute("/_app/downloads")({
  validateSearch: (search: Record<string, unknown>): DownloadsSearch => ({
    ...(FILTERS.some(([s]) => s && s === search.state) ? { state: search.state as TaskState } : {}),
    ...(search.everyone === true || search.everyone === "true" ? { everyone: true as const } : {}),
  }),
  component: DownloadsPage,
});

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[1] === "/downloads" || q.queryKey[1] === "/queue",
    });
}

function DownloadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isAdmin = useIsAdmin();
  const everyone = isAdmin && search.everyone === true;
  const downloads = $api.useInfiniteQuery(
    "get",
    "/downloads",
    {
      params: {
        query: { page_size: 50, ...(search.state ? { state: search.state } : {}), ...(everyone ? { all: true } : {}) },
      },
    },
    {
      initialPageParam: "",
      getNextPageParam: (last) => last.next_page_token || undefined,
      pageParamName: "page_token",
    },
  );
  const items = downloads.data?.pages.flatMap((page) => page.items) ?? [];
  const set = (change: Partial<DownloadsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  return (
    <>
      <PageHeader
        title="Downloads"
        description="Chapters stored in the library, once for everyone. Updates live."
        actions={isAdmin ? <PauseButton /> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([state, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={search.state === state}
            onClick={() => set({ state })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              search.state === state ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
        {isAdmin ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={everyone}
              onChange={(e) => set({ everyone: e.target.checked ? true : undefined })}
              className="size-4 accent-primary"
            />
            Everyone's
          </label>
        ) : null}
      </div>
      {downloads.error ? <ErrorAlert error={downloads.error} onRetry={() => void downloads.refetch()} /> : null}
      {downloads.isPending ? <Loading /> : null}
      {downloads.data && items.length === 0 ? (
        <EmptyState icon={<Download />} title={search.state ? "Nothing here" : "No downloads"}>
          {search.state ? "Try another filter." : "Download chapters from a work's page."}
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((item) => (
            <DownloadRow key={item.task.id} item={item} canManage={isAdmin} />
          ))}
        </ul>
      ) : null}
      {downloads.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            disabled={downloads.isFetchingNextPage}
            onClick={() => void downloads.fetchNextPage()}
          >
            {downloads.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older downloads
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Admins pause and resume all downloads (the queue's download kind). */
function PauseButton() {
  const refresh = useRefresh();
  const queue = $api.useQuery("get", "/queue");
  const kind = queue.data?.kinds.find((k) => k.kind === KIND);
  const update = $api.useMutation("patch", "/queue/kinds/{kind}", {
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!kind) return null;
  return (
    <Button
      variant="outline"
      disabled={update.isPending}
      onClick={() => update.mutate({ params: { path: { kind: KIND } }, body: { paused: !kind.paused } })}
    >
      {kind.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      {kind.paused ? "Resume downloads" : "Pause downloads"}
    </Button>
  );
}

function DownloadRow({ item, canManage }: { item: Item; canManage: boolean }) {
  const refresh = useRefresh();
  const { task } = item;
  const path = { params: { path: { task_id: task.id } } };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const cancel = $api.useMutation("post", "/tasks/{task_id}/cancel", { onSuccess: refresh, onError });
  const retry = $api.useMutation("post", "/tasks/{task_id}/retry", { onSuccess: refresh, onError });
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-56">
          <Link
            to="/works/$workId"
            params={{ workId: item.work_id }}
            className="font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
          >
            {item.work_title}
          </Link>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.chapter_title}</p>
        </div>
        <RunStatusBadge status={task.state} />
        <span className="text-xs text-muted-foreground">
          {formatRelative(task.finished_at ?? task.started_at ?? task.created_at)}
        </span>
        {canManage && (task.state === "queued" || task.state === "running") ? (
          <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(path)}>
            <X aria-hidden />
            Cancel
          </Button>
        ) : null}
        {canManage && (task.state === "failed" || task.state === "cancelled") ? (
          <Button variant="ghost" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(path)}>
            <RotateCcw aria-hidden />
            Retry
          </Button>
        ) : null}
      </div>
      {task.state === "running" && task.progress ? <ProgressLine progress={task.progress} /> : null}
      {task.last_error ? (
        <p className="text-xs text-destructive [overflow-wrap:anywhere]">
          {task.last_error}
          {task.state === "queued" && task.attempts > 0 ? ` · trying again ${formatRelative(task.run_after)}` : ""}
        </p>
      ) : null}
    </li>
  );
}
