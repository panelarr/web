// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LibraryBig, ListFilter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { HeaderSearch } from "@/components/header-search";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { VirtualGrid } from "@/components/virtual-grid";
import { VirtualList } from "@/components/virtual-list";
import { useLibrary } from "@/features/catalog/library-index";
import { LibraryCard, LibraryRow } from "@/features/library/library-card";
import { LibrarySheet } from "@/features/library/library-sheet";
import {
  DEFAULT_VIEW,
  FILTERS,
  type Filter,
  filterCounts,
  type LibraryView,
  SORTS,
  type Sort,
  viewLibrary,
} from "@/features/library/library-view";
import { usePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface LibrarySearch {
  q?: string;
  /** Filters on, comma-separated. */
  only?: string;
}

const isFilter = (value: string): value is Filter => value in FILTERS;

export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.only === "string" && search.only.split(",").some(isFilter)
      ? { only: search.only.split(",").filter(isFilter).join(",") }
      : {}),
  }),
  component: LibraryPage,
});

type Remembered = Omit<LibraryView, "q" | "filters">;

/** The library's sort and display as the user left them (on every device). */
function parse(raw: unknown): Remembered {
  const saved = (raw ?? {}) as Partial<Record<keyof Remembered, unknown>>;
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  return {
    sort: typeof saved.sort === "string" && saved.sort in SORTS ? (saved.sort as Sort) : DEFAULT_VIEW.sort,
    reverse: flag(saved.reverse, DEFAULT_VIEW.reverse),
    layout:
      saved.layout === "compact" || saved.layout === "list" || saved.layout === "comfortable"
        ? saved.layout
        : DEFAULT_VIEW.layout,
    unreadBadges: flag(saved.unreadBadges, DEFAULT_VIEW.unreadBadges),
    downloadBadges: flag(saved.downloadBadges, DEFAULT_VIEW.downloadBadges),
    continueButton: flag(saved.continueButton, DEFAULT_VIEW.continueButton),
  };
}

function LibraryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const library = useLibrary();
  const remembered = usePreference("library", parse);
  const [sheet, setSheet] = useState(false);
  const [searching, setSearching] = useState(false);
  const view: LibraryView = {
    ...remembered.value,
    q: search.q,
    filters: (search.only?.split(",") ?? []).filter(isFilter),
  };
  const change = (next: Partial<LibraryView>) => {
    const { q, filters, ...rest } = next;
    if (Object.keys(rest).length > 0) remembered.save({ ...remembered.value, ...rest });
    if (q !== undefined || filters !== undefined) {
      void navigate({
        search: (prev) => ({
          ...prev,
          ...(q !== undefined ? { q: q || undefined } : {}),
          ...(filters !== undefined ? { only: filters.length > 0 ? filters.join(",") : undefined } : {}),
        }),
        replace: true,
      });
    }
  };

  const all = library.data ?? [];
  const shown = viewLibrary(all, view);
  const counts = useMemo(() => filterCounts(all), [all]);
  const label =
    view.filters.length > 0
      ? `Filter, sort and display (${view.filters.length} filters on)`
      : "Filter, sort and display";

  return (
    <>
      {/* One row: the title and count, the search (an icon on phones) and the sheet's button. */}
      <header className="mb-4 flex min-h-10 items-center gap-1 md:mb-6 md:gap-2">
        <div className={cn("mr-auto flex min-w-0 items-baseline gap-2", searching && "hidden md:flex")}>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          {library.data ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {all.length} {all.length === 1 ? "work" : "works"}
            </span>
          ) : null}
        </div>
        {all.length > 0 ? (
          <>
            <HeaderSearch
              label="Search your library"
              value={search.q ?? ""}
              onChange={(q) => change({ q })}
              onOpenChange={setSearching}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              title={label}
              className={cn(view.filters.length > 0 && "text-primary")}
              onClick={() => setSheet(true)}
            >
              <ListFilter aria-hidden />
            </Button>
          </>
        ) : null}
      </header>
      {library.error ? <ErrorAlert error={library.error} onRetry={() => void library.refetch()} /> : null}
      {library.isPending ? <Loading /> : null}
      {library.data?.length === 0 ? (
        <EmptyState icon={<LibraryBig />} title="Your library is empty">
          <p>Find works in the catalogue and add them here.</p>
          <Button asChild className="mt-4">
            <Link to="/browse">Browse the catalogue</Link>
          </Button>
        </EmptyState>
      ) : null}
      {all.length > 0 && shown.length === 0 ? (
        <EmptyState icon={<Search />} title="Nothing matches">
          {view.filters.length > 0 ? (
            <Button variant="link" onClick={() => change({ filters: [] })}>
              Show every work
            </Button>
          ) : null}
        </EmptyState>
      ) : null}
      {shown.length > 0 && view.layout === "list" ? (
        <VirtualList
          label="Library"
          className="overflow-hidden rounded-xl border bg-card"
          items={shown}
          getKey={(entry) => entry.work.id}
          estimateSize={72}
          renderItem={(entry) => <LibraryRow entry={entry} view={view} />}
        />
      ) : shown.length > 0 ? (
        <VirtualGrid
          items={shown}
          getKey={(entry) => entry.work.id}
          {...(view.layout === "compact" ? { estimateRowHeight: (width: number) => width * 1.5, gap: 10 } : {})}
          renderItem={(entry) => <LibraryCard entry={entry} view={view} compact={view.layout === "compact"} />}
        />
      ) : null}
      <LibrarySheet open={sheet} onOpenChange={setSheet} view={view} counts={counts} onChange={change} />
    </>
  );
}
