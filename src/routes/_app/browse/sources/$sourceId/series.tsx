// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cover } from "@/features/catalog/cover";
import { label, TYPE_LABELS } from "@/features/catalog/labels";
import { LIBRARY_INDEX_KEY } from "@/features/catalog/library-index";
import { formatDate } from "@/lib/format";

type Candidate = components["schemas"]["EntryCandidate"];

export const Route = createFileRoute("/_app/browse/sources/$sourceId/series")({
  validateSearch: (search: Record<string, unknown>): { key: string } => ({
    key: typeof search.key === "string" ? search.key : "",
  }),
  component: SeriesPage,
});

const SHOWN_CHAPTERS = 30;

function SeriesPage() {
  const { sourceId } = Route.useParams();
  const { key } = Route.useSearch();
  const router = useRouter();
  const init = { params: { path: { source_id: sourceId }, query: { key } } };
  const series = $api.useQuery("get", "/sources/{source_id}/series", init, { enabled: !!key });
  const chapters = $api.useQuery("get", "/sources/{source_id}/chapters", init, { enabled: !!key });
  const [allChapters, setAllChapters] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => router.history.back()}>
        <ArrowLeft aria-hidden />
        Back
      </Button>
      {isApiError(series.error, "not_found") || !key ? (
        <EmptyState title="Series not found" />
      ) : series.error ? (
        <ErrorAlert error={series.error} onRetry={() => void series.refetch()} />
      ) : null}
      {series.isPending && key ? <Loading /> : null}
      {series.data ? (
        <article className="grid gap-8 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="mx-auto w-44 sm:w-52 md:mx-0 md:w-full">
            <Cover url={series.data.cover_url} title={series.data.title} eager className="shadow-md" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{series.data.title}</h1>
            {series.data.alt_titles.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {series.data.alt_titles.join(" · ")}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {[...series.data.authors, ...series.data.artists.filter((a) => !series.data.authors.includes(a))].join(
                ", ",
              )}
              {series.data.status ? ` · ${series.data.status.replaceAll("_", " ")}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AddFromSource sourceId={sourceId} seriesKey={key} title={series.data.title} />
              {series.data.url ? (
                <Button variant="ghost" asChild>
                  <a href={series.data.url} target="_blank" rel="noopener noreferrer nofollow">
                    <ExternalLink aria-hidden />
                    Open on the site
                  </a>
                </Button>
              ) : null}
            </div>
            {series.data.genres.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Genres">
                {series.data.genres.map((genre) => (
                  <li key={genre}>
                    <Badge variant="secondary">{genre}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            {series.data.description ? (
              <p className="mt-4 max-w-prose text-sm leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
                {series.data.description}
              </p>
            ) : null}
            <section aria-labelledby="chapters" className="mt-6">
              <h2 id="chapters" className="mb-2 text-lg font-semibold">
                Chapters{chapters.data ? ` (${chapters.data.chapters.length})` : ""}
              </h2>
              {chapters.error ? <ErrorAlert error={chapters.error} onRetry={() => void chapters.refetch()} /> : null}
              {chapters.isPending ? <Loading /> : null}
              {chapters.data ? (
                <ul className="divide-y rounded-lg border">
                  {(allChapters ? chapters.data.chapters : chapters.data.chapters.slice(0, SHOWN_CHAPTERS)).map(
                    (chapter) => (
                      <li key={chapter.key} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{chapter.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[chapter.scanlator, chapter.uploaded_at ? formatDate(chapter.uploaded_at) : undefined]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
              {chapters.data && chapters.data.chapters.length > SHOWN_CHAPTERS && !allChapters ? (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAllChapters(true)}>
                  Show all {chapters.data.chapters.length}
                </Button>
              ) : null}
            </section>
          </div>
        </article>
      ) : null}
    </>
  );
}

/**
 * Adds what's on the source to the library. A clear match is added at once; otherwise the
 * user picks which catalogue entry it is.
 */
function AddFromSource({ sourceId, seriesKey, title }: { sourceId: string; seriesKey: string; title: string }) {
  const { user } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<Candidate[] | undefined>();
  const source = { source_id: sourceId, key: seriesKey };
  const done = async (workId: string, workTitle: string) => {
    setCandidates(undefined);
    void queryClient.invalidateQueries({ queryKey: LIBRARY_INDEX_KEY });
    toast.success(`Added ${workTitle}.`);
    await navigate({ to: "/works/$workId", params: { workId } });
  };
  const find = $api.useMutation("post", "/library/from-source", {
    onSuccess: (result) => {
      if (result.added && result.entry) void done(result.entry.work.id, result.entry.work.title);
      else setCandidates(result.candidates);
    },
  });
  const add = $api.useMutation("post", "/library", {
    onSuccess: (entry) => void done(entry.work.id, entry.work.title),
  });
  const mayAdd = user.role === "admin" || user.grants.may_add;

  return (
    <>
      <Button disabled={!mayAdd || find.isPending} onClick={() => find.mutate({ body: source })}>
        {find.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Add to library
      </Button>
      {find.error ? <ErrorAlert error={find.error} title="Not added" /> : null}
      <Dialog open={candidates !== undefined} onOpenChange={(open) => !open && setCandidates(undefined)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Which work is it?</DialogTitle>
            <DialogDescription>
              Panelarr keeps one entry per work. Pick the catalogue entry “{title}” belongs to.
            </DialogDescription>
          </DialogHeader>
          {add.error ? <ErrorAlert error={add.error} title="Not added" /> : null}
          {candidates?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No likely entry in the catalogue.</p>
          ) : null}
          <ul className="grid gap-2">
            {candidates?.map((candidate) => (
              <li key={candidate.entry.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <Cover
                  url={candidate.entry.cover?.url}
                  title={candidate.entry.title}
                  className="w-12 shrink-0 rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{candidate.entry.title}</p>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {[
                      candidate.entry.year,
                      label(TYPE_LABELS, candidate.entry.type),
                      `title ${Math.round(candidate.score * 100)}%`,
                      candidate.matched_title && candidate.matched_title !== candidate.entry.title
                        ? `as “${candidate.matched_title}”`
                        : undefined,
                      candidate.authors_match === undefined
                        ? undefined
                        : candidate.authors_match
                          ? "authors match"
                          : "authors differ",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={add.isPending}
                  onClick={() => add.mutate({ body: { entry_id: candidate.entry.id, source } })}
                >
                  This one
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" asChild>
              <Link to="/browse" search={{ q: title }}>
                Search the catalogue instead
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
