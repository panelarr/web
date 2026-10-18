// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { MANUAL } from "@/api/events";
import { ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ReaderScreen } from "@/features/reader/reader-screen";

interface ReadSearch {
  /** The page to open at (from 0), or the last one. */
  page?: number | "last";
  /** Read this copy instead of the chosen one. */
  variant?: string;
}

export const Route = createFileRoute("/_reader/read/$chapterId")({
  validateSearch: (search: Record<string, unknown>): ReadSearch => ({
    ...(search.page === "last"
      ? { page: "last" as const }
      : Number.isInteger(Number(search.page)) && search.page !== undefined && search.page !== ""
        ? { page: Math.max(0, Number(search.page)) }
        : {}),
    ...(typeof search.variant === "string" && /^[0-9a-f-]{36}$/.test(search.variant)
      ? { variant: search.variant }
      : {}),
  }),
  component: ReadPage,
});

function ReadPage() {
  const { chapterId } = Route.useParams();
  const { page, variant } = Route.useSearch();
  // Scrolling on into another chapter (long strips) keeps the same reader: only the URL follows.
  const continuing = useRouterState({
    select: (state) => (state.location.state as { continuing?: boolean }).continuing === true,
  });
  const session = useRef(chapterId);
  if (!continuing) session.current = chapterId;
  const pages = $api.useQuery(
    "get",
    "/chapters/{chapter_id}/pages",
    { params: { path: { chapter_id: chapterId }, query: variant ? { variant_id: variant } : {} } },
    // Fetched once per chapter: progress saves echo back as events, which mustn't reload it.
    { staleTime: 5 * 60_000, meta: MANUAL },
  );
  const work = $api.useQuery(
    "get",
    "/works/{work_id}",
    { params: { path: { work_id: pages.data?.work_id ?? "" } } },
    { enabled: !!pages.data },
  );

  if (pages.error) {
    return (
      <div className="mx-auto grid max-w-md gap-4 px-gutter py-16 pt-safe">
        <ErrorAlert
          error={pages.error}
          title={isApiError(pages.error, "no_copy") ? "No source has this chapter now" : "The chapter didn't open"}
          onRetry={() => void pages.refetch()}
        />
        <WayBack chapterId={chapterId} />
      </div>
    );
  }
  if (!pages.data) return <Opening chapterId={chapterId} />;
  return <ReaderScreen key={session.current} data={pages.data} work={work.data} asked={page} />;
}

/** How long opening may take before the reader says it's slow and offers the way back. */
const SLOW_MS = 8_000;

function Opening({ chapterId }: { chapterId: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="grid justify-items-center gap-2 px-gutter pt-safe">
      <Loading label="Opening the chapter…" />
      {slow ? (
        <>
          <p className="-mt-12 text-center text-sm text-muted-foreground">
            Still waiting for the source. It may be slow or down.
          </p>
          <WayBack chapterId={chapterId} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The series the chapter belongs to, if a page already listed it (its chapters, or the library's
 * "continue" chapter): the page list that failed is what would have said.
 */
function useSeriesOf(chapterId: string): string | undefined {
  const queryClient = useQueryClient();
  for (const [key, data] of queryClient.getQueriesData<{ chapters?: Array<{ id: string }> }>({
    queryKey: ["get", "/works/{work_id}/chapters"],
  })) {
    const workId = (key[2] as { params?: { path?: { work_id?: string } } } | undefined)?.params?.path?.work_id;
    if (workId && data?.chapters?.some((chapter) => chapter.id === chapterId)) return workId;
  }
  for (const [, data] of queryClient.getQueriesData<{
    entries?: Array<{ work: { id: string }; continue_chapter_id?: string }>;
  }>({ queryKey: ["get", "/library"] })) {
    const entry = data?.entries?.find((e) => e.continue_chapter_id === chapterId);
    if (entry) return entry.work.id;
  }
  return undefined;
}

function WayBack({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const workId = useSeriesOf(chapterId);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {workId ? (
        <Button variant="outline" asChild>
          <Link to="/works/$workId" params={{ workId }}>
            <ArrowLeft aria-hidden />
            Back to the series
          </Link>
        </Button>
      ) : window.history.length > 1 ? (
        <Button variant="outline" onClick={() => router.history.back()}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
      ) : null}
      <Button variant="ghost" asChild>
        <Link to="/">Library</Link>
      </Button>
    </div>
  );
}
