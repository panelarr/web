// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  BookOpen,
  CheckCheck,
  CircleCheck,
  Download,
  EllipsisVertical,
  HardDriveDownload,
  Layers,
  Pin,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VirtualList } from "@/components/virtual-list";
import { HealthBadge } from "@/features/admin/health-badge";
import { useLibraryIndex } from "@/features/catalog/library-index";
import { downloadLabel, useCanDownload, useOpenDownloads } from "@/features/downloads/use-downloads";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type Chapter, chapterLabel, chaptersAfter, chaptersBefore, type Progress, reasonText } from "./chapters";

type Work = components["schemas"]["Work"];

export interface ChaptersView {
  order: "asc" | "desc";
  unread: boolean;
}

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

/** The work's unified chapters: one row per chapter across its sources. */
export function ChaptersPanel({
  work,
  view,
  onViewChange,
}: {
  work: Work;
  view: ChaptersView;
  onViewChange: (view: ChaptersView) => void;
}) {
  const path = { params: { path: { work_id: work.id } } };
  const chapters = $api.useQuery("get", "/works/{work_id}/chapters", {
    params: { path: { work_id: work.id }, query: { order: view.order } },
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
  const seen = $api.useMutation("post", "/library/{work_id}/seen", { onSuccess: invalidate, onError });
  const mark = $api.useMutation("post", "/works/{work_id}/progress", { onSuccess: invalidate, onError });
  const { user } = useMe();
  const canDownload = useCanDownload();
  const downloads = useOpenDownloads(canDownload);
  const library = useLibraryIndex();
  const autoDownload = library.data?.get(work.entry_id)?.auto_download ?? false;
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
  const queue = (body: { chapter_ids: string[] } | { scope: "all" | "unread" }) => download.mutate({ ...path, body });

  const byChapter = useMemo(
    () => new Map((progress.data?.chapters ?? []).map((p) => [p.chapter_id, p])),
    [progress.data],
  );
  const all = chapters.data?.chapters ?? [];
  const shown = view.unread ? all.filter((c) => !byChapter.get(c.id)?.completed) : all;
  const fresh = all.filter((c) => c.new).length;
  const read = all.filter((c) => byChapter.get(c.id)?.completed).length;
  const setRead = (ids: string[], value: boolean) => {
    if (ids.length > 0) mark.mutate({ ...path, body: { chapter_ids: ids, read: value } });
  };

  if (chapters.error) return <ErrorAlert error={chapters.error} onRetry={() => void chapters.refetch()} />;
  if (chapters.isPending) return <Loading />;

  const continueId = progress.data?.continue_chapter_id;
  const continueChapter = all.find((c) => c.id === continueId);
  const started = (progress.data?.chapters.length ?? 0) > 0;

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
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          {all.length} {all.length === 1 ? "chapter" : "chapters"}
          {all.length > 0 ? ` · ${read} read` : ""}
          {fresh > 0 ? ` · ${fresh} new` : ""}
        </p>
        {fresh > 0 && work.in_library ? (
          <Button variant="outline" size="sm" disabled={seen.isPending} onClick={() => seen.mutate(path)}>
            <CheckCheck aria-hidden />
            Mark seen
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          aria-pressed={view.unread}
          className={cn(view.unread && "border-primary text-primary")}
          onClick={() => onViewChange({ ...view, unread: !view.unread })}
        >
          Unread only
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={view.order === "asc" ? "Oldest first" : "Newest first"}
          title={view.order === "asc" ? "Oldest first" : "Newest first"}
          onClick={() => onViewChange({ ...view, order: view.order === "asc" ? "desc" : "asc" })}
        >
          {view.order === "asc" ? <ArrowDownNarrowWide aria-hidden /> : <ArrowUpNarrowWide aria-hidden />}
        </Button>
        <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate(path)}>
          <RefreshCw className={refresh.isPending ? "animate-spin" : undefined} aria-hidden />
          Check for new
        </Button>
        {canDownload ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={download.isPending}>
                <Download aria-hidden />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </div>
      {all.length === 0 ? (
        <EmptyState icon={<Layers />} title="No chapters yet">
          {work.attached_sources === 0
            ? "Attach the work on a source first (Sources tab)."
            : "Its sources list no chapters yet."}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="All read" />
      ) : (
        <VirtualList
          label="Chapters"
          className="overflow-hidden rounded-xl border bg-card"
          items={shown}
          getKey={(c) => c.id}
          renderItem={(chapter) => (
            <ChapterRow
              work={work}
              chapter={chapter}
              progress={byChapter.get(chapter.id)}
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
    </div>
  );
}

function ChapterRow({
  work,
  chapter,
  progress,
  onRead,
  onReadBefore,
  download,
  onDownload,
  onDeleteFile,
}: {
  work: Work;
  chapter: Chapter;
  progress: Progress | undefined;
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
  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", read && "text-muted-foreground")}>
            <Link
              to="/read/$chapterId"
              params={{ chapterId: chapter.id }}
              className="font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
            >
              {chapterLabel(chapter)}
            </Link>
            {chapter.new ? <Badge>New</Badge> : null}
            {download ? (
              <Badge variant="outline" className="border-info/40 text-info">
                {downloadLabel(download)}
              </Badge>
            ) : null}
            {chapter.pinned ? (
              <Pin className="size-3.5 text-muted-foreground" aria-label="Copy chosen by hand" />
            ) : null}
            {chapter.downloaded ? (
              <HardDriveDownload className="size-3.5 text-success" aria-label="Downloaded" />
            ) : null}
            {chapter.available ? null : <Badge variant="destructive">No longer listed</Badge>}
            {read ? <CircleCheck className="size-4 text-success" aria-label="Read" /> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {[
              chosen?.source_name,
              chosen?.scanlator,
              chosen?.lang?.toUpperCase(),
              chosen?.uploaded_at ? formatDate(chosen.uploaded_at) : undefined,
              chapter.variants > 1 ? reasonText(chapter.reason) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {progress && !read && progress.pages ? (
            <p className="mt-0.5 text-xs text-primary">
              Page {progress.page + 1} of {progress.pages} · {formatRelative(progress.updated_at)}
            </p>
          ) : null}
        </div>
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
                <DropdownMenuItem onSelect={() => onDownload(true)}>Download this and later chapters</DropdownMenuItem>
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
                <DropdownMenuItem onSelect={() => setOpen(true)}>Show the {chapter.variants} copies</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open ? <Variants work={work} chapter={chapter} /> : null}
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
