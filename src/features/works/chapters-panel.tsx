// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCheck,
  CircleCheck,
  Download,
  EllipsisVertical,
  HardDriveDownload,
  Layers,
  ListFilter,
  Pin,
  RefreshCw,
  SquareCheckBig,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VirtualList } from "@/components/virtual-list";
import { HealthBadge } from "@/features/admin/health-badge";
import { useLibrary } from "@/features/catalog/library-index";
import { downloadLabel, useCanDownload, useOpenDownloads } from "@/features/downloads/use-downloads";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ChapterView, chapterName, filtersOn, nextToDownload, scanlators, viewChapters } from "./chapter-view";
import { ChapterViewSheet } from "./chapter-view-sheet";
import { type Chapter, chapterLabel, chaptersAfter, chaptersBefore, type Progress, reasonText } from "./chapters";

type Work = components["schemas"]["Work"];

function useInvalidateWork(workId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[1] === "string" && q.queryKey[1].startsWith("/works/{work_id}"),
    });
    void queryClient.invalidateQueries({ queryKey: ["library-index"] });
    return workId;
  };
}

/** An icon button with its name as a tooltip (and for screen readers). */
function IconButton({ label, children, className, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-8 shrink-0", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * The work's unified chapters, one plain row each across its sources: unread bright, read
 * dimmed. Icon buttons mark read, download, filter / sort / display, and select chapters to act
 * on several at once.
 */
export function ChaptersPanel({
  work,
  view,
  onViewChange,
}: {
  work: Work;
  view: ChapterView;
  onViewChange: (change: Partial<ChapterView>) => void;
}) {
  const path = { params: { path: { work_id: work.id } } };
  // Always in reading order: the view arranges it here, so changing it needs no request.
  const chapters = $api.useQuery("get", "/works/{work_id}/chapters", {
    params: { path: { work_id: work.id }, query: { order: "asc" } },
  });
  const progress = $api.useQuery("get", "/works/{work_id}/progress", path);
  const invalidate = useInvalidateWork(work.id);
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const refresh = $api.useMutation("post", "/works/{work_id}/refresh", {
    onSuccess: (result) =>
      toast.success(
        result.queued === 0
          ? "No source to check yet."
          : `Checking ${result.queued} ${result.queued === 1 ? "source" : "sources"}…`,
      ),
    onError,
  });
  const mark = $api.useMutation("post", "/works/{work_id}/progress", { onSuccess: invalidate, onError });
  const { user } = useMe();
  const canDownload = useCanDownload();
  const downloads = useOpenDownloads(canDownload);
  const library = useLibrary();
  const autoDownload = library.data?.find((entry) => entry.work.id === work.id)?.auto_download ?? false;
  const queryClient = useQueryClient();
  const download = $api.useMutation("post", "/works/{work_id}/downloads", {
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "/downloads" });
      const parts = [
        result.queued > 0 ? `${result.queued} queued` : undefined,
        result.downloaded > 0 ? `${result.downloaded} already downloaded` : undefined,
        result.unavailable > 0 ? `${result.unavailable} no longer listed` : undefined,
      ].filter(Boolean);
      toast.success(parts.length > 0 ? `Downloads: ${parts.join(", ")}.` : "Nothing new to download.");
    },
    onError,
  });
  const auto = $api.useMutation("put", "/library/{work_id}/auto-download", {
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["library-index"] }),
    onError,
  });
  const deleteFile = $api.useMutation("delete", "/chapters/{chapter_id}/file", { onSuccess: invalidate, onError });
  const queue = (body: { chapter_ids: string[] } | { scope: "all" | "unread" }) => {
    if ("chapter_ids" in body && body.chapter_ids.length === 0) return toast.info("Nothing to download.");
    download.mutate({ ...path, body });
  };

  const [sheet, setSheet] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const byChapter = useMemo(
    () => new Map((progress.data?.chapters ?? []).map((p) => [p.chapter_id, p])),
    [progress.data],
  );
  const isRead = (id: string) => byChapter.get(id)?.completed ?? false;
  const all = chapters.data?.chapters ?? [];
  const shown = viewChapters(all, isRead, view);
  const unread = all.filter((c) => !isRead(c.id)).length;
  const setRead = (ids: string[], value: boolean) => {
    if (ids.length > 0) mark.mutate({ ...path, body: { chapter_ids: ids, read: value } });
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  if (chapters.error) return <ErrorAlert error={chapters.error} onRetry={() => void chapters.refetch()} />;
  if (chapters.isPending) return <Loading />;

  const continueId = progress.data?.continue_chapter_id;
  const continueChapter = all.find((c) => c.id === continueId);
  const started = (progress.data?.chapters.length ?? 0) > 0;
  const filters = filtersOn(view);

  return (
    <div className="grid gap-3">
      {continueChapter ? (
        <Button asChild size="lg" className="w-full sm:w-auto sm:justify-self-start">
          <Link to="/read/$chapterId" params={{ chapterId: continueChapter.id }}>
            <BookOpen aria-hidden />
            {started ? "Continue" : "Start reading"}: {chapterLabel(continueChapter)}
          </Link>
        </Button>
      ) : null}
      <div className="flex items-center gap-0.5">
        <p className="mr-auto min-w-0 truncate text-sm text-muted-foreground">
          {all.length} {all.length === 1 ? "chapter" : "chapters"}
          {all.length > 0 ? ` · ${unread === 0 ? "all read" : `${unread} unread`}` : ""}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="Mark read" disabled={all.length === 0}>
              <CheckCheck aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                setRead(
                  all.map((c) => c.id),
                  true,
                )
              }
            >
              Mark all as read
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                setRead(
                  all.map((c) => c.id),
                  false,
                )
              }
            >
              Mark all as unread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canDownload ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Download" disabled={download.isPending}>
                <Download aria-hidden />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => queue({ chapter_ids: nextToDownload(all, isRead, 1) })}>
                Next chapter
              </DropdownMenuItem>
              {[5, 10, 25].map((count) => (
                <DropdownMenuItem
                  key={count}
                  onSelect={() => queue({ chapter_ids: nextToDownload(all, isRead, count) })}
                >
                  Next {count} chapters
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => queue({ scope: "unread" })}>Unread chapters</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => queue({ scope: "all" })}>All chapters</DropdownMenuItem>
              {work.in_library ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={autoDownload}
                    onCheckedChange={(enabled) =>
                      auto.mutate({ params: { path: { work_id: work.id } }, body: { enabled: enabled === true } })
                    }
                  >
                    New chapters automatically
                  </DropdownMenuCheckboxItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <IconButton
          label={filters > 0 ? `Filter, sort and display (${filters} filters on)` : "Filter, sort and display"}
          className={cn(filters > 0 && "text-primary")}
          onClick={() => setSheet(true)}
        >
          <ListFilter aria-hidden />
        </IconButton>
        <IconButton
          label={selecting ? "Stop selecting" : "Select chapters"}
          aria-pressed={selecting}
          className={cn(selecting && "text-primary")}
          disabled={all.length === 0}
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
        >
          <SquareCheckBig aria-hidden />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More">
              <EllipsisVertical aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={refresh.isPending} onSelect={() => refresh.mutate(path)}>
              <RefreshCw aria-hidden />
              Check for new chapters
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {all.length === 0 ? (
        <EmptyState icon={<Layers />} title="No chapters yet">
          {work.attached_sources === 0
            ? "Attach the work on a source first (Sources tab)."
            : "Its sources list no chapters yet."}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title={view.unread && filters === 1 ? "All read" : "No chapter matches"}>
          {filters > 0 ? (
            <Button
              variant="link"
              onClick={() =>
                onViewChange({ unread: false, downloaded: false, bookmarked: false, scanlator: undefined })
              }
            >
              Show every chapter
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <VirtualList
          label="Chapters"
          className={cn("overflow-hidden rounded-xl border bg-card", selecting && "mb-20")}
          items={shown}
          getKey={(c) => c.id}
          renderItem={(chapter) => (
            <ChapterRow
              work={work}
              chapter={chapter}
              name={chapterName(chapter, view.display)}
              progress={byChapter.get(chapter.id)}
              selecting={selecting}
              selected={selected.has(chapter.id)}
              onSelect={(on) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(chapter.id);
                  else next.delete(chapter.id);
                  return next;
                })
              }
              onRead={(value) => setRead([chapter.id], value)}
              onReadBefore={() => setRead(chaptersBefore(all, chapter.id), true)}
              download={downloads.get(chapter.id)}
              onDownload={
                canDownload
                  ? (andLater) =>
                      queue({
                        chapter_ids: andLater ? [chapter.id, ...chaptersAfter(all, chapter.id)] : [chapter.id],
                      })
                  : undefined
              }
              onDeleteFile={
                user.role === "admin" && chapter.downloaded
                  ? () => deleteFile.mutate({ params: { path: { chapter_id: chapter.id } } })
                  : undefined
              }
            />
          )}
        />
      )}
      {selecting ? (
        <SelectionBar
          count={selected.size}
          total={shown.length}
          onAll={(on) => setSelected(on ? new Set(shown.map((c) => c.id)) : new Set())}
          onClose={stopSelecting}
          actions={[
            ...(canDownload ? [{ label: "Download", run: () => queue({ chapter_ids: [...selected] }) }] : []),
            { label: "Mark as read", run: () => setRead([...selected], true) },
            { label: "Mark as unread", run: () => setRead([...selected], false) },
            ...(user.role === "admin"
              ? [
                  {
                    label: "Delete downloaded files",
                    destructive: true,
                    run: () => {
                      const stored = all.filter((c) => selected.has(c.id) && c.downloaded);
                      void Promise.all(
                        stored.map((c) =>
                          api.DELETE("/chapters/{chapter_id}/file", { params: { path: { chapter_id: c.id } } }),
                        ),
                      )
                        .then(() => toast.success(`Deleted ${stored.length} downloaded files.`))
                        .catch(onError)
                        .finally(invalidate);
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      <ChapterViewSheet
        open={sheet}
        onOpenChange={setSheet}
        view={view}
        onChange={onViewChange}
        scanlators={scanlators(all)}
        bookmarks={false}
      />
    </div>
  );
}

/** The bar while selecting: how many, all or none, and what to do with them. */
function SelectionBar({
  count,
  total,
  onAll,
  onClose,
  actions,
}: {
  count: number;
  total: number;
  onAll: (on: boolean) => void;
  onClose: () => void;
  actions: ReadonlyArray<{ label: string; run: () => void; destructive?: boolean }>;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-4 md:bottom-6">
      <div
        role="toolbar"
        aria-label="Selected chapters"
        className="flex items-center gap-1 rounded-full border bg-popover py-1 pr-1 pl-4 text-sm shadow-lg"
      >
        <span className="mr-1 tabular-nums">{count} selected</span>
        <Button variant="ghost" size="sm" onClick={() => onAll(count < total)}>
          {count < total ? "All" : "None"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-full" disabled={count === 0}>
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuLabel>
              {count} {count === 1 ? "chapter" : "chapters"}
            </DropdownMenuLabel>
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                variant={action.destructive ? "destructive" : "default"}
                onSelect={() => {
                  action.run();
                  onClose();
                }}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Stop selecting" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function ChapterRow({
  work,
  chapter,
  name,
  progress,
  selecting,
  selected,
  onSelect,
  onRead,
  onReadBefore,
  download,
  onDownload,
  onDeleteFile,
}: {
  work: Work;
  chapter: Chapter;
  name: string;
  progress: Progress | undefined;
  selecting: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onRead: (read: boolean) => void;
  onReadBefore: () => void;
  /** Its download, while queued or running. */
  download?: components["schemas"]["Task"] | undefined;
  onDownload?: ((andLater: boolean) => void) | undefined;
  onDeleteFile?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const read = progress?.completed ?? false;
  const chosen = chapter.chosen;
  const state = download
    ? downloadLabel(download)
    : chapter.downloaded
      ? "Downloaded"
      : progress && !read && progress.pages
        ? `Page ${progress.page + 1} of ${progress.pages} · ${formatRelative(progress.updated_at)}`
        : undefined;
  return (
    <div className={cn("border-b last:border-b-0", selected && "bg-primary/10")}>
      <div className="flex items-center gap-3 px-4 py-3">
        {selecting ? (
          <Checkbox checked={selected} onCheckedChange={(on) => onSelect(on === true)} aria-label={`Select ${name}`} />
        ) : null}
        <div className={cn("min-w-0 flex-1", read && "text-muted-foreground opacity-70")}>
          {selecting ? (
            <button
              type="button"
              className="block w-full text-left font-medium [overflow-wrap:anywhere]"
              onClick={() => onSelect(!selected)}
            >
              {name}
            </button>
          ) : (
            <Link
              to="/read/$chapterId"
              params={{ chapterId: chapter.id }}
              aria-label={read ? `${name} (read)` : name}
              className="block font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
            >
              {name}
            </Link>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <span>
              {[
                chosen?.source_name,
                chosen?.scanlator,
                chosen?.lang?.toUpperCase(),
                chosen?.uploaded_at ? formatDate(chosen.uploaded_at) : undefined,
                chapter.variants > 1 ? reasonText(chapter.reason) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {state ? (
              <span className={cn(download ? "text-info" : progress && !read ? "text-primary" : undefined)}>
                · {state}
              </span>
            ) : null}
            {chapter.available ? null : <span className="text-destructive">· No longer listed</span>}
            {chapter.pinned ? <Pin className="size-3 text-muted-foreground" aria-label="Copy chosen by hand" /> : null}
            {chapter.downloaded ? <HardDriveDownload className="size-3 text-success" aria-hidden /> : null}
          </p>
        </div>
        {selecting ? null : (
          <>
            {chapter.variants > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open}
                aria-label={`${chapter.variants} copies of ${chapterLabel(chapter)}`}
                onClick={() => setOpen(!open)}
                className="text-muted-foreground"
              >
                <Layers aria-hidden />
                {chapter.variants}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`More for ${chapterLabel(chapter)}`}>
                  <EllipsisVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRead(!read)}>
                  {read ? "Mark as unread" : "Mark as read"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onReadBefore}>Mark earlier chapters as read</DropdownMenuItem>
                {onDownload && !chapter.downloaded && !download ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDownload(false)}>Download</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDownload(true)}>
                      Download this and later chapters
                    </DropdownMenuItem>
                  </>
                ) : null}
                {onDeleteFile ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={onDeleteFile}>
                      Delete the downloaded file
                    </DropdownMenuItem>
                  </>
                ) : null}
                {chapter.variants > 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setOpen(true)}>
                      Show the {chapter.variants} copies
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      {open && !selecting ? <Variants work={work} chapter={chapter} /> : null}
    </div>
  );
}

/** Every copy of a chapter, to pick one by hand. */
function Variants({ work, chapter }: { work: Work; chapter: Chapter }) {
  const { user } = useMe();
  const canPin = user.role === "admin" || user.grants.may_manage_matches;
  const invalidate = useInvalidateWork(work.id);
  const detail = $api.useQuery("get", "/works/{work_id}/chapters/{chapter_id}", {
    params: { path: { work_id: work.id, chapter_id: chapter.id } },
  });
  const pin = $api.useMutation("put", "/works/{work_id}/chapters/{chapter_id}/pin", {
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const setPin = (variant_id: string | null) =>
    pin.mutate({ params: { path: { work_id: work.id, chapter_id: chapter.id } }, body: { variant_id } });

  return (
    <div className="border-t bg-muted/40 px-4 py-3">
      {detail.error ? <ErrorAlert error={detail.error} /> : null}
      {detail.isPending ? <Loading label="Loading copies…" /> : null}
      <ul className="grid gap-2" aria-label={`Copies of ${chapterLabel(chapter)}`}>
        {detail.data?.variants.map((variant) => {
          const chosen = detail.data.chapter.chosen?.id === variant.id;
          return (
            <li
              key={variant.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2.5 text-sm",
                chosen && "border-primary/50",
              )}
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {variant.source_name}
                  {variant.source_health !== "ok" ? <HealthBadge status={variant.source_health} /> : null}
                  {chosen ? (
                    <Badge variant="secondary">{detail.data.chapter.pinned ? "Pinned" : "Chosen"}</Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {[
                    variant.name,
                    variant.scanlator,
                    variant.lang?.toUpperCase(),
                    variant.uploaded_at ? formatDate(variant.uploaded_at) : undefined,
                    `priority ${variant.priority}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canPin && !chosen ? (
                <Button size="sm" variant="outline" disabled={pin.isPending} onClick={() => setPin(variant.id)}>
                  Use this copy
                </Button>
              ) : null}
              {canPin && chosen && detail.data.chapter.pinned ? (
                <Button size="sm" variant="ghost" disabled={pin.isPending} onClick={() => setPin(null)}>
                  Unpin
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
