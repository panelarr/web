// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
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
    { staleTime: 5 * 60_000 },
  );
  const work = $api.useQuery(
    "get",
    "/works/{work_id}",
    { params: { path: { work_id: pages.data?.work_id ?? "" } } },
    { enabled: !!pages.data },
  );

  if (pages.error) {
    return (
      <div className="mx-auto grid max-w-md gap-4 px-gutter py-16">
        <ErrorAlert
          error={pages.error}
          title={isApiError(pages.error, "no_copy") ? "No source has this chapter now" : "The chapter didn't open"}
          onRetry={() => void pages.refetch()}
        />
        <Button variant="ghost" asChild>
          <Link to="/">
            <ArrowLeft aria-hidden />
            Back to the library
          </Link>
        </Button>
      </div>
    );
  }
  if (!pages.data) return <Loading label="Opening the chapter…" />;
  return <ReaderScreen key={session.current} data={pages.data} work={work.data} asked={page} />;
}
