// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, EllipsisVertical, History, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { HeaderSearch } from "@/components/header-search";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cover } from "@/features/catalog/cover";
import { byDay, detailText, type HistoryItem } from "@/features/history/history";
import { cn } from "@/lib/utils";

interface HistorySearch {
  q?: string;
  /** Every chapter read, not one entry per series. */
  every?: true;
  /** Every chapter read of this series. */
  work?: string;
}

export const Route = createFileRoute("/_app/history")({
  validateSearch: (search: Record<string, unknown>): HistorySearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(search.every === true || search.every === "true" ? { every: true as const } : {}),
    ...(typeof search.work === "string" && /^[0-9a-f-]{36}$/.test(search.work) ? { work: search.work } : {}),
  }),
  component: HistoryPage,
});

const isHistory = (key: readonly unknown[]) => key[0] === "history";

/** What the user read, newest first, by day: one line per series, or every chapter. */
function HistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [clearing, setClearing] = useState(false);
  const perSeries = !search.every && !search.work;
  const query = {
    per: perSeries ? ("series" as const) : ("chapter" as const),
    ...(search.work ? { work_id: search.work } : {}),
    ...(search.q ? { q: search.q } : {}),
  };
  const history = useInfiniteQuery({
    queryKey: ["history", query],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/me/history", {
        params: { query: { ...query, page_size: 50, ...(pageParam ? { page_token: pageParam } : {}) } },
      });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
  });
  const refresh = () => void queryClient.invalidateQueries({ predicate: (q) => isHistory(q.queryKey) });
  const clear = $api.useMutation("delete", "/me/history", {
    onSuccess: () => {
      refresh();
      toast.success("History cleared. Read marks stay.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const seriesTitle = search.work ? items[0]?.work_title : undefined;
  const set = (change: Partial<HistorySearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  return (
    <>
      {search.work ? (
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link to="/history" search={{}}>
            <ArrowLeft aria-hidden />
            History
          </Link>
        </Button>
      ) : null}
      <header className="mb-4 flex min-h-10 items-center gap-1 md:mb-6 md:gap-2">
        <h1
          className={cn(
            "mr-auto min-w-0 truncate text-2xl font-semibold tracking-tight",
            searching && "hidden md:block",
          )}
        >
          {search.work ? (seriesTitle ?? "History") : "History"}
        </h1>
        {search.work ? null : (
          <HeaderSearch
            label="Search your history"
            value={search.q ?? ""}
            onChange={(q) => set({ q: q || undefined })}
            onOpenChange={setSearching}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="History menu">
              <EllipsisVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {search.work ? null : (
              <DropdownMenuCheckboxItem
                checked={search.every === true}
                onCheckedChange={(on) => set({ every: on === true ? true : undefined })}
              >
                Every chapter read
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={items.length === 0} onSelect={() => setClearing(true)}>
              Clear history…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {history.error ? <ErrorAlert error={history.error} onRetry={() => void history.refetch()} /> : null}
      {history.isPending ? <Loading /> : null}
      {history.data && items.length === 0 ? (
        <EmptyState icon={<History />} title={search.q ? "Nothing read matches" : "Nothing read yet"}>
          {search.q ? null : "What you read shows here, newest first."}
        </EmptyState>
      ) : null}
      {/* minmax(0, 1fr): a long line truncates instead of widening the page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {byDay(items).map(([day, entries]) => (
          <section key={`${day}-${entries[0]?.chapter_id}`} aria-label={day}>
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">{day}</h2>
            <ul className="sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card">
              {entries.map((item) => (
                <li key={`${item.chapter_id}-${item.updated_at}`} className="border-b last:border-b-0">
                  <HistoryRow item={item} perSeries={perSeries} onRemoved={refresh} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {history.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
            {history.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older
          </Button>
        </div>
      ) : null}
      <AlertDialog open={clearing} onOpenChange={setClearing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your history?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything you've read so far leaves your history. Chapters stay marked read, and what you read next shows
              here again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clear.mutate({})}>Clear history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HistoryRow({ item, perSeries, onRemoved }: { item: HistoryItem; perSeries: boolean; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);
  const remove = $api.useMutation("delete", "/me/history/{work_id}", {
    onSuccess: () => {
      onRemoved();
      toast.success(`${item.work_title} left your history. Read marks stay.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  // One line per series resumes where the series is at; a chapter's line opens that chapter.
  const resume = perSeries ? item.continue_chapter_id : item.chapter_id;
  return (
    <div className="flex items-center gap-3 py-2 sm:px-4">
      <Link
        to="/works/$workId"
        params={{ workId: item.work_id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Cover url={item.work_cover_url} title={item.work_title} className="w-10 shrink-0 rounded" />
        <div className={cn("min-w-0 flex-1", item.completed && !perSeries && "opacity-70")}>
          <p className="truncate font-medium">{item.work_title}</p>
          <p className="truncate text-xs text-muted-foreground">{detailText(item)}</p>
        </div>
      </Link>
      {resume ? (
        <Button variant="ghost" size="icon" asChild className="size-9 text-primary">
          <Link
            to="/read/$chapterId"
            params={{ chapterId: resume }}
            aria-label={`Resume ${item.work_title}`}
            title="Resume"
          >
            <Play className="fill-current" aria-hidden />
          </Link>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`More for ${item.work_title}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {perSeries ? (
            <DropdownMenuItem asChild>
              <Link to="/history" search={{ work: item.work_id }}>
                Every chapter read
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
            Remove from history…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.work_title} from your history?</AlertDialogTitle>
            <AlertDialogDescription>
              What you've read of it so far leaves your history. Its chapters stay marked read.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate({ params: { path: { work_id: item.work_id } } })}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
