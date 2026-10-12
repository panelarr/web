// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { $api, api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthBadge } from "@/features/admin/health-badge";
import { Cover } from "@/features/catalog/cover";
import { EntryGrid } from "@/features/catalog/entry-card";
import {
  changedCount,
  type FilterState,
  filterValues,
  initialState,
  type SourceFilter,
} from "@/features/sources/filters";
import { SourceFiltersSheet } from "@/features/sources/filters-sheet";
import { cn } from "@/lib/utils";

type Series = components["schemas"]["SourceSeries"];
type Page = components["schemas"]["SourceSeriesPage"];
const LISTS = ["popular", "latest", "search"] as const;
type List = (typeof LISTS)[number];

interface SourceSearch {
  list?: List;
  q?: string;
  /** Changed filter values, by position. */
  filters?: FilterState;
}

export const Route = createFileRoute("/_app/admin/sources/$sourceId/")({
  validateSearch: (search: Record<string, unknown>): SourceSearch => ({
    ...(LISTS.includes(search.list as List) ? { list: search.list as List } : {}),
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(search.filters && typeof search.filters === "object" ? { filters: search.filters as FilterState } : {}),
  }),
  component: SourcePage,
});

const nextPage = (last: Page, all: Page[]) => (last.has_next_page ? all.length + 1 : undefined);

function SourcePage() {
  const { sourceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sources = $api.useQuery("get", "/sources");
  const source = sources.data?.sources.find((s) => s.id === sourceId);
  const canLatest = source?.capabilities.includes("latest") ?? false;
  const canSearch = source?.capabilities.includes("search") ?? false;
  const list: List = search.list ?? (search.q || search.filters ? "search" : "popular");
  const [text, setText] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = $api.useQuery(
    "get",
    "/sources/{source_id}/filters",
    { params: { path: { source_id: sourceId } } },
    { enabled: canSearch && (source?.capabilities.includes("filters") ?? false) },
  );
  const declared = (filters.data?.filters ?? []) as unknown as SourceFilter[];
  const state = useMemo(() => ({ ...initialState(declared), ...search.filters }), [declared, search.filters]);

  const results = useInfiniteQuery({
    queryKey: ["source-list", sourceId, list, search.q ?? "", list === "search" ? filterValues(declared, state) : []],
    enabled: source !== undefined && (list !== "search" || !!search.q || changedCount(declared, state) > 0),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    queryFn: async ({ pageParam, signal }) => {
      const path = { source_id: sourceId };
      if (list === "search") {
        const { data } = await api.POST("/sources/{source_id}/search", {
          params: { path },
          body: { query: search.q ?? "", page: pageParam, filters: filterValues(declared, state) },
          signal,
        });
        return data as Page;
      }
      const { data } = await api.GET(
        list === "latest" ? "/sources/{source_id}/latest" : "/sources/{source_id}/popular",
        {
          params: { path, query: { page: pageParam } },
          signal,
        },
      );
      return data as Page;
    },
  });
  const series = results.data?.pages.flatMap((page) => page.series) ?? [];
  const setSearch = (next: SourceSearch) => void navigate({ search: next, replace: true });

  if (sources.isPending) return <Loading />;
  if (!source) return <EmptyState title="Source not found">It doesn't exist, or you can't use it.</EmptyState>;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link to="/admin/sources">
          <ArrowLeft aria-hidden />
          Sources
        </Link>
      </Button>
      <header className="mb-4 flex items-center gap-3">
        <SourceIcon name={source.name} url={source.icon_url} className="size-10" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{source.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="uppercase">
              {source.lang}
            </Badge>
            {source.health.status !== "ok" ? <HealthBadge status={source.health.status} /> : null}
          </p>
        </div>
      </header>
      <nav aria-label="Lists" className="mb-4 flex flex-wrap gap-2">
        {(["popular", ...(canLatest ? ["latest"] : []), ...(canSearch ? ["search"] : [])] as List[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={list === id ? "page" : undefined}
            onClick={() =>
              setSearch({ list: id, ...(id === "search" ? { q: search.q, filters: search.filters } : {}) })
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm capitalize",
              list === id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {id}
          </button>
        ))}
      </nav>
      {list === "search" ? (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch({
              list: "search",
              ...(text.trim() ? { q: text.trim() } : {}),
              ...(search.filters ? { filters: search.filters } : {}),
            });
          }}
        >
          <Input
            type="search"
            aria-label={`Search ${source.name}`}
            placeholder={`Search ${source.name}`}
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="outline" aria-label="Search">
            <Search aria-hidden />
          </Button>
          {declared.length > 0 ? (
            <Button type="button" variant="outline" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden />
              <span className="sr-only sm:not-sr-only">Filters</span>
              {changedCount(declared, state) > 0 ? (
                <Badge className="px-1.5">{changedCount(declared, state)}</Badge>
              ) : null}
            </Button>
          ) : null}
        </form>
      ) : null}
      <SourceFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={declared}
        value={state}
        onApply={(next) => {
          const defaults = initialState(declared);
          const changed = Object.fromEntries(
            Object.entries(next).filter(([k, v]) => JSON.stringify(defaults[k]) !== JSON.stringify(v)),
          );
          setSearch({
            list: "search",
            ...(text.trim() ? { q: text.trim() } : {}),
            ...(Object.keys(changed).length ? { filters: changed } : {}),
          });
        }}
      />
      {isApiError(results.error, "source_failed") || isApiError(results.error, "rate_limited") ? (
        <ErrorAlert
          error={results.error}
          title={`${source.name} didn't answer`}
          onRetry={() => void results.refetch()}
        />
      ) : results.error ? (
        <ErrorAlert error={results.error} onRetry={() => void results.refetch()} />
      ) : null}
      {list === "search" && !search.q && changedCount(declared, state) === 0 ? (
        <EmptyState icon={<Search />} title={`Search ${source.name}`}>
          Type a title{declared.length > 0 ? ", or pick filters" : ""}.
        </EmptyState>
      ) : results.isPending ? (
        <Loading />
      ) : results.data && series.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : null}
      {series.length > 0 ? (
        <EntryGrid>
          {series.map((item) => (
            <li key={item.key}>
              <SeriesCard sourceId={sourceId} series={item} />
            </li>
          ))}
        </EntryGrid>
      ) : null}
      {results.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
            {results.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}

function SeriesCard({ sourceId, series }: { sourceId: string; series: Series }) {
  return (
    <Link
      to="/admin/sources/$sourceId/series"
      params={{ sourceId }}
      search={{ key: series.key }}
      className="group flex min-w-0 flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Cover url={series.cover_url} title={series.title} className="transition-transform group-hover:scale-[1.02]" />
      <p className="line-clamp-2 px-0.5 text-sm leading-snug font-medium [overflow-wrap:anywhere]">{series.title}</p>
    </Link>
  );
}
