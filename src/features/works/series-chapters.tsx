// SPDX-License-Identifier: GPL-3.0-or-later

import { ExternalLink, TriangleAlert } from "lucide-react";
import { $api } from "@/api/client";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { VirtualList } from "@/components/virtual-list";
import { formatDate, formatRelative } from "@/lib/format";

/** One source's chapters of the work, exactly as the source lists them. */
export function SeriesChaptersPanel({ workId, seriesId }: { workId: string; seriesId: string }) {
  const list = $api.useQuery("get", "/works/{work_id}/series/{series_id}/chapters", {
    params: { path: { work_id: workId, series_id: seriesId } },
  });
  if (list.error) return <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <Loading />;
  const { series, chapters, checked_at, check_error } = list.data;
  return (
    <div className="grid gap-3">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span className="[overflow-wrap:anywhere]">
          {series.title} · {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
          {checked_at ? ` · checked ${formatRelative(checked_at)}` : ""}
        </span>
        {series.url ? (
          <a
            href={series.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            Open on the site
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </p>
      {check_error ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span className="[overflow-wrap:anywhere]">The last check failed: {check_error}</span>
        </p>
      ) : null}
      {chapters.length === 0 ? (
        <EmptyState title="The source lists no chapters" />
      ) : (
        <VirtualList
          label={`Chapters on ${series.title}`}
          className="overflow-hidden rounded-xl border bg-card"
          items={chapters}
          getKey={(c) => c.key}
          estimateSize={52}
          renderItem={(chapter) => (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b px-4 py-2.5 text-sm last:border-b-0">
              <span
                className={
                  chapter.present
                    ? "min-w-0 flex-1 [overflow-wrap:anywhere]"
                    : "min-w-0 flex-1 text-muted-foreground line-through [overflow-wrap:anywhere]"
                }
              >
                {chapter.name}
              </span>
              {chapter.present ? null : <Badge variant="outline">Removed</Badge>}
              <span className="text-xs text-muted-foreground">
                {[
                  chapter.scanlator,
                  chapter.lang?.toUpperCase(),
                  chapter.uploaded_at ? formatDate(chapter.uploaded_at) : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
        />
      )}
    </div>
  );
}
