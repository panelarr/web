// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LibraryBig, Search } from "lucide-react";
import { useMemo } from "react";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VirtualGrid } from "@/components/virtual-grid";
import { Cover } from "@/features/catalog/cover";
import { label, TYPE_LABELS } from "@/features/catalog/labels";
import { type LibraryEntry, useLibrary } from "@/features/catalog/library-index";
import { cn } from "@/lib/utils";

const SORTS = { title: "Title", added: "Recently added", new: "New chapters" } as const;
type Sort = keyof typeof SORTS;

interface LibrarySearch {
  q?: string;
  sort?: Sort;
  only?: "new";
}

export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.sort === "string" && search.sort in SORTS ? { sort: search.sort as Sort } : {}),
    ...(search.only === "new" ? { only: "new" as const } : {}),
  }),
  component: LibraryPage,
});

const SORTERS: Record<Sort, (a: LibraryEntry, b: LibraryEntry) => number> = {
  title: (a, b) => a.work.title.localeCompare(b.work.title),
  added: (a, b) => b.added_at.localeCompare(a.added_at),
  new: (a, b) => b.new_chapters - a.new_chapters || a.work.title.localeCompare(b.work.title),
};

function LibraryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const library = useLibrary();
  const set = (change: Partial<LibrarySearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  const shown = useMemo(() => {
    const q = search.q?.toLowerCase();
    return (library.data ?? [])
      .filter((entry) => !q || entry.work.title.toLowerCase().includes(q))
      .filter((entry) => search.only !== "new" || entry.new_chapters > 0)
      .sort(SORTERS[search.sort ?? "title"]);
  }, [library.data, search.q, search.only, search.sort]);
  const withNew = library.data?.filter((entry) => entry.new_chapters > 0).length ?? 0;

  return (
    <>
      <PageHeader
        title="Library"
        description={
          library.data ? `${library.data.length} ${library.data.length === 1 ? "work" : "works"}` : undefined
        }
      />
      {library.data && library.data.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search your library"
              placeholder="Search your library"
              className="pl-9"
              value={search.q ?? ""}
              onChange={(e) => set({ q: e.target.value || undefined })}
            />
          </div>
          <button
            type="button"
            aria-pressed={search.only === "new"}
            onClick={() => set({ only: search.only === "new" ? undefined : "new" })}
            className={cn(
              "h-9 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
              search.only === "new" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            New chapters{withNew > 0 ? ` (${withNew})` : ""}
          </button>
          <div className="w-44">
            <NativeSelect
              aria-label="Sort"
              value={search.sort ?? "title"}
              onChange={(e) => set({ sort: e.target.value as Sort })}
            >
              {Object.entries(SORTS).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      ) : null}
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
      {library.data && library.data.length > 0 && shown.length === 0 ? (
        <EmptyState icon={<Search />} title="Nothing matches" />
      ) : null}
      {shown.length > 0 ? (
        <VirtualGrid
          items={shown}
          getKey={(entry) => entry.work.id}
          renderItem={(entry) => <LibraryCard entry={entry} />}
        />
      ) : null}
    </>
  );
}

function LibraryCard({ entry }: { entry: LibraryEntry }) {
  const { work } = entry;
  return (
    <Link
      to="/works/$workId"
      params={{ workId: work.id }}
      className="group flex min-w-0 flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <Cover url={work.cover_url} title={work.title} className="transition-transform group-hover:scale-[1.02]" />
        {entry.new_chapters > 0 ? (
          <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow tabular-nums">
            {entry.new_chapters}
            <span className="sr-only"> new chapters</span>
          </span>
        ) : null}
        {work.attached_sources === 0 ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow">
            No source yet
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-0.5">
        <p className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">{work.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[work.year, label(TYPE_LABELS, work.type)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
