// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellDot, ChevronDown, Download, EllipsisVertical, HardDriveDownload, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cover } from "@/features/catalog/cover";
import { useCanDownload } from "@/features/downloads/use-downloads";
import { groupUpdates, type UpdateItem, type UpdateRow, updateLabel } from "@/features/updates/updates";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/updates")({
  component: UpdatesPage,
});

const FEED = ["updates"] as const;
const statusOptions = () => $api.queryOptions("get", "/me/updates/status");

/** New chapters in the works of your library, by day, one row per series. */
function UpdatesPage() {
  const queryClient = useQueryClient();
  const feed = useInfiniteQuery({
    queryKey: FEED,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/me/updates", {
        params: { query: { page_size: 60, ...(pageParam ? { page_token: pageParam } : {}) } },
      });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
  });
  // While a check runs, ask how it's going; when it ends, the feed is fetched again.
  const status = useQuery({
    ...statusOptions(),
    refetchInterval: (query) => ((query.state.data?.checking ?? 0) > 0 ? 2_000 : false),
  });
  const checking = status.data?.checking ?? 0;
  const wasChecking = useRef(false);
  useEffect(() => {
    if (wasChecking.current && checking === 0) void queryClient.invalidateQueries({ queryKey: FEED });
    wasChecking.current = checking > 0;
  }, [checking, queryClient]);
  const refresh = $api.useMutation("post", "/me/updates/refresh", {
    onSuccess: (result) => {
      if (result.queued === 0) toast.info("Nothing to check: add works to your library first.");
      void queryClient.invalidateQueries({ queryKey: statusOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <header className="mb-1 flex min-h-10 items-center gap-1 md:gap-2">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">Updates</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Check for new chapters"
          title="Check for new chapters"
          disabled={refresh.isPending || checking > 0}
          onClick={() => refresh.mutate({})}
        >
          <RefreshCw className={cn((refresh.isPending || checking > 0) && "animate-spin")} aria-hidden />
        </Button>
      </header>
      <p role="status" className="mb-4 text-xs text-muted-foreground md:mb-6">
        {checking > 0
          ? `Checking ${checking} series…`
          : status.data?.last_checked_at
            ? `Last update: ${formatRelative(status.data.last_checked_at)}`
            : "Not checked yet"}
        {status.data && status.data.failing > 0 ? ` · ${status.data.failing} couldn't be checked` : ""}
      </p>
      {feed.error ? <ErrorAlert error={feed.error} onRetry={() => void feed.refetch()} /> : null}
      {feed.isPending ? <Loading /> : null}
      {feed.data && items.length === 0 ? (
        <EmptyState icon={<BellDot />} title="No new chapters">
          New chapters of the works in your library show here.
        </EmptyState>
      ) : null}
      {/* minmax(0, 1fr): a long line truncates instead of widening the page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {groupUpdates(items).map(([day, rows]) => (
          <section key={`${day}-${rows[0]?.chapters[0]?.chapter_id}`} aria-label={day}>
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">{day}</h2>
            <ul className="sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card">
              {rows.map((row) => (
                <li key={row.workId} className="border-b last:border-b-0">
                  <UpdatesRow row={row} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {feed.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
            {feed.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older
          </Button>
        </div>
      ) : null}
    </>
  );
}

function DownloadState({ item }: { item: UpdateItem }) {
  if (item.download_state === "downloaded")
    return <HardDriveDownload className="size-3.5 shrink-0 text-success" aria-label="Downloaded" />;
  if (item.download_state === "queued" || item.download_state === "downloading")
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-info" aria-label="Downloading" />;
  return null;
}

function UpdatesRow({ row }: { row: UpdateRow }) {
  const queryClient = useQueryClient();
  const canDownload = useCanDownload();
  const [open, setOpen] = useState(false);
  const [first, ...more] = row.chapters as [UpdateItem, ...UpdateItem[]];
  const after = () => void queryClient.invalidateQueries({ queryKey: FEED });
  const mark = $api.useMutation("post", "/works/{work_id}/progress", {
    onSuccess: after,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const download = $api.useMutation("post", "/works/{work_id}/downloads", {
    onSuccess: (result) => {
      after();
      toast.success(result.queued > 0 ? `${result.queued} queued.` : "Nothing new to download.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const path = { params: { path: { work_id: row.workId } } };
  const unread = row.chapters.filter((c) => !c.read).map((c) => c.chapter_id);
  const toDownload = row.chapters.filter((c) => c.download_state === "none").map((c) => c.chapter_id);
  return (
    <div className="py-2 sm:px-4">
      <div className="flex items-center gap-3">
        <Link
          to="/read/$chapterId"
          params={{ chapterId: first.chapter_id }}
          aria-label={`${row.title}: ${updateLabel(first)}`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
            first.read && "opacity-60",
          )}
        >
          <Cover url={row.cover} title={row.title} className="w-10 shrink-0 rounded" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.title}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {first.new && !first.read ? (
                <>
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="sr-only">New:</span>
                </>
              ) : null}
              <span className="truncate">{updateLabel(first)}</span>
              <DownloadState item={first} />
            </p>
          </div>
        </Link>
        {canDownload && toDownload.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Download ${row.title}: ${toDownload.length === 1 ? updateLabel(first) : `${toDownload.length} chapters`}`}
            disabled={download.isPending}
            onClick={() => download.mutate({ ...path, body: { chapter_ids: toDownload } })}
          >
            <Download aria-hidden />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`More for ${row.title}`}>
              <EllipsisVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/works/$workId" params={{ workId: row.workId }}>
                The series
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={unread.length === 0}
              onSelect={() => mark.mutate({ ...path, body: { chapter_ids: unread, read: true } })}
            >
              {row.chapters.length === 1 ? "Mark as read" : "Mark these as read"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {more.length > 0 ? (
        <>
          {open ? (
            <ul className="mt-1 ml-[3.25rem] grid gap-0.5" aria-label={`More new chapters of ${row.title}`}>
              {more.map((item) => (
                <li key={item.chapter_id}>
                  <Link
                    to="/read/$chapterId"
                    params={{ chapterId: item.chapter_id }}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded py-1 text-sm hover:underline",
                      item.read && "text-muted-foreground opacity-60",
                    )}
                  >
                    <span className="truncate">{updateLabel(item)}</span>
                    <DownloadState item={item} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="link"
            size="sm"
            className="ml-[3.25rem] h-auto px-0 py-1 text-xs"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Show fewer" : `Show ${more.length} more ${more.length === 1 ? "chapter" : "chapters"}`}
          </Button>
        </>
      ) : null}
    </div>
  );
}
