// SPDX-License-Identifier: GPL-3.0-or-later

import { useDebouncedCallback } from "@tanstack/react-pacer";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { BookOpen, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { useIsAdmin } from "@/auth/session";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntryCard, EntryGrid } from "@/features/catalog/entry-card";
import { CatalogFilters, type CatalogSearch, countFilters, validateCatalogSearch } from "@/features/catalog/filters";
import { label, STATUS_LABELS, TYPE_LABELS } from "@/features/catalog/labels";

export const Route = createFileRoute("/_app/browse/")({
  validateSearch: validateCatalogSearch,
  component: BrowsePage,
});

const PAGE_SIZE = 30;

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [text, setText] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Typing updates the address (and so the results) once the user pauses.
  const router = useRouter();
  const commitQuery = useDebouncedCallback(
    (q: string) => {
      // The user may have tapped a result meanwhile: never pull them back here.
      if (router.state.location.pathname.replace(/\/$/, "") !== "/browse") return;
      void navigate({ search: (prev) => ({ ...prev, q: q.trim() || undefined }), replace: true });
    },
    { wait: 300 },
  );
  // Back/forward and links change the address: show what it says.
  useEffect(() => setText(search.q ?? ""), [search.q]);

  const setSearch = (next: CatalogSearch) => void navigate({ search: next, replace: true });
  const filters = countFilters(search);

  return (
    <>
      <PageHeader title="Browse" description="Find works in the catalogue and add them to your library." />
      <div className="sticky top-[var(--safe-top)] z-20 -mx-4 mb-4 bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <search>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              commitQuery(text);
            }}
          >
            <SearchInput
              icon
              enterKeyHint="search"
              aria-label="Search the catalogue"
              placeholder="Search by any title"
              className="flex-1"
              inputClassName="h-10"
              value={text}
              onChange={(value) => {
                setText(value);
                commitQuery(value);
              }}
            />
            <Button type="button" variant="outline" className="h-10" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden />
              <span className="sr-only sm:not-sr-only">Filters</span>
              {filters > 0 ? <Badge className="ml-0.5 px-1.5">{filters}</Badge> : null}
            </Button>
          </form>
        </search>
        <ActiveFilters search={search} onChange={setSearch} />
      </div>
      <CatalogFilters open={filtersOpen} onOpenChange={setFiltersOpen} value={search} onChange={setSearch} />
      {search.q ? <SearchResults search={search} /> : <BrowseResults search={search} />}
    </>
  );
}

/** The filters in use, each removable with one tap. */
function ActiveFilters({ search, onChange }: { search: CatalogSearch; onChange: (next: CatalogSearch) => void }) {
  const chips: Array<{ key: string; text: string; remove: () => void }> = [];
  for (const type of search.type ?? []) {
    chips.push({
      key: `type-${type}`,
      text: label(TYPE_LABELS, type) ?? type,
      remove: () => onChange({ ...search, type: search.type?.filter((t) => t !== type) }),
    });
  }
  for (const status of search.status ?? []) {
    chips.push({
      key: `status-${status}`,
      text: label(STATUS_LABELS, status) ?? status,
      remove: () => onChange({ ...search, status: search.status?.filter((s) => s !== status) }),
    });
  }
  for (const genre of search.genre ?? []) {
    chips.push({
      key: `genre-${genre}`,
      text: genre,
      remove: () => onChange({ ...search, genre: search.genre?.filter((g) => g !== genre) }),
    });
  }
  if (search.year_from || search.year_to) {
    chips.push({
      key: "years",
      text: `${search.year_from ?? "…"}–${search.year_to ?? "…"}`,
      remove: () => onChange({ ...search, year_from: undefined, year_to: undefined }),
    });
  }
  if (chips.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Filters in use">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.remove}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs hover:bg-accent"
            aria-label={`Remove filter ${chip.text}`}
          >
            {chip.text}
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function query(search: CatalogSearch) {
  const { q: _q, ...rest } = search;
  return { ...rest, page_size: PAGE_SIZE };
}

const nextPage = (last: { next_page_token: string }) => last.next_page_token || undefined;

function SearchResults({ search }: { search: CatalogSearch }) {
  const results = $api.useInfiniteQuery(
    "get",
    "/catalog/search",
    { params: { query: { ...query(search), q: search.q ?? "" } } },
    { initialPageParam: "", getNextPageParam: nextPage, pageParamName: "page_token" },
  );
  const hits = results.data?.pages.flatMap((page) => page.hits) ?? [];
  return (
    <Results
      query={results}
      count={results.data?.pages[0]?.total_size}
      noProviders={results.data?.pages[0]?.no_providers ?? false}
      empty={
        <EmptyState icon={<Search />} title={`Nothing found for “${search.q}”`}>
          Try another title, or fewer filters.
        </EmptyState>
      }
    >
      {hits.map((hit) => (
        <CardItem key={hit.entry.id} entry={hit.entry} matched={hit.matched} />
      ))}
    </Results>
  );
}

function BrowseResults({ search }: { search: CatalogSearch }) {
  const results = $api.useInfiniteQuery(
    "get",
    "/catalog/browse",
    { params: { query: query(search) } },
    { initialPageParam: "", getNextPageParam: nextPage, pageParamName: "page_token" },
  );
  const entries = results.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <Results
      query={results}
      count={results.data?.pages[0]?.total_size}
      noProviders={results.data?.pages[0]?.no_providers ?? false}
      empty={
        countFilters(search) > 0 ? (
          <EmptyState icon={<BookOpen />} title="Nothing matches these filters" />
        ) : (
          <EmptyCatalogue />
        )
      }
    >
      {entries.map((entry) => (
        <CardItem key={entry.id} entry={entry} />
      ))}
    </Results>
  );
}

/** No entries at all: the metadata service's providers haven't delivered any yet. */
function EmptyCatalogue() {
  const isAdmin = useIsAdmin();
  return (
    <EmptyState icon={<BookOpen />} title="The catalogue is empty">
      The metadata service has no entries yet: its providers haven't been synced.{" "}
      {isAdmin ? (
        <Link to="/admin/metadata" className="underline underline-offset-4">
          Check the metadata service
        </Link>
      ) : (
        "Ask your admin."
      )}
    </EmptyState>
  );
}

function CardItem({
  entry,
  matched,
}: {
  entry: Parameters<typeof EntryCard>[0]["entry"];
  matched?: string | undefined;
}) {
  return (
    <li>
      <EntryCard entry={entry} matched={matched} />
    </li>
  );
}

interface InfiniteLike {
  error: unknown;
  isPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
}

function Results({
  query: results,
  count,
  noProviders,
  empty,
  children,
}: {
  query: InfiniteLike;
  count: number | undefined;
  noProviders: boolean;
  empty: React.ReactNode;
  children: React.ReactNode[];
}) {
  const isAdmin = useIsAdmin();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = results;

  // Load the next page as the end of the list comes into view.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isApiError(results.error, "meta_unavailable")) {
    return (
      <ErrorAlert error={results.error} title="The catalogue is unavailable" onRetry={() => void results.refetch()} />
    );
  }
  if (results.error) return <ErrorAlert error={results.error} onRetry={() => void results.refetch()} />;
  if (results.isPending) return <Loading />;
  if (noProviders) {
    return (
      <EmptyState icon={<BookOpen />} title="The catalogue is empty">
        The metadata service has no provider yet.{" "}
        {isAdmin ? (
          <Link to="/admin/metadata" className="underline underline-offset-4">
            Check the connection
          </Link>
        ) : (
          "Ask your admin to set one up."
        )}
      </EmptyState>
    );
  }
  if (children.length === 0) return empty;
  return (
    <>
      {count !== undefined ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          {count === 1 ? "1 work" : `${count} works`}
        </p>
      ) : null}
      <EntryGrid>{children}</EntryGrid>
      <div ref={sentinel} className="mt-6 flex justify-center">
        {hasNextPage ? (
          <Button variant="outline" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Load more
          </Button>
        ) : null}
      </div>
    </>
  );
}
