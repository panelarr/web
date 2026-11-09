// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Info, LibraryBig, ListFilter, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, isApiError } from "@/api/errors";
import { HeaderSearch } from "@/components/header-search";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { VirtualGrid } from "@/components/virtual-grid";
import { VirtualList } from "@/components/virtual-list";
import { useLibrary } from "@/features/catalog/library-index";
import { LibraryCard, LibraryRow } from "@/features/library/library-card";
import { LibrarySheet } from "@/features/library/library-sheet";
import {
  activeFilters,
  DEFAULT_VIEW,
  fromDefinition,
  type LibraryView,
  SORTS,
  type Sort,
  toDefinition,
  viewLibrary,
  withoutFilters,
} from "@/features/library/library-view";
import { ManageViewsSheet } from "@/features/library/manage-views-sheet";
import { NewViewDialog } from "@/features/library/new-view-dialog";
import { useLibraryViews } from "@/features/library/use-library-views";
import { ViewSwitcher } from "@/features/library/view-switcher";
import { usePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface LibrarySearch {
  q?: string;
  /** The saved view shown; without it, the default view. */
  view?: string;
  /** Filters from before saved views (`?only=unread,started`): dropped on load. */
  only?: string;
}

export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.view === "string" && search.view ? { view: search.view } : {}),
    ...(search.only !== undefined ? { only: String(search.only) } : {}),
  }),
  beforeLoad: ({ search }) => {
    // Old links' filters would be a third place a view's state lives: replaced, not kept.
    if (search.only !== undefined) {
      const { only: _, ...rest } = search;
      throw redirect({ to: "/", search: rest, replace: true });
    }
  },
  component: LibraryPage,
});

/** The sort and display remembered before saved views: the first view starts from them. */
function parseRemembered(raw: unknown): LibraryView {
  const saved = (raw ?? {}) as Partial<Record<string, unknown>>;
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  return {
    ...DEFAULT_VIEW,
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

/** The name of the view every user starts with. */
const FIRST_VIEW = "Library";

function LibraryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const library = useLibrary();
  const views = useLibraryViews();
  // Read only: the old preference is left as it was, so an older app still finds it.
  const remembered = usePreference("library", parseRemembered);
  const [sheet, setSheet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState(false);

  const list = views.views;
  const requested = search.view;
  const active = list?.find((v) => (requested ? v.id === requested : v.default));

  // The first visit after saved views arrived: the user's remembered setup becomes their
  // first view. Another device may do the same at the same moment: its name is then taken,
  // and the list it made is fetched.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !views.query.isSuccess || list?.length !== 0 || !remembered.loaded) return;
    started.current = true;
    views.create
      .mutateAsync({ name: FIRST_VIEW, definition: toDefinition(remembered.value), default: true })
      .catch((error: unknown) => {
        if (isApiError(error, "name_taken")) void views.query.refetch();
        else toast.error(`Your library view wasn't saved: ${errorMessage(error)}`);
      });
  }, [views.query.isSuccess, list?.length, remembered.loaded, remembered.value, views.create, views.query]);

  // A view that isn't (or is no longer) the user's: their default instead. One they had here
  // (deleted just now, or on another device) goes quietly; a link to someone else's says so.
  const seen = useRef(new Set<string>());
  for (const view of list ?? []) seen.current.add(view.id);
  useEffect(() => {
    if (!requested || !list || list.length === 0 || list.some((v) => v.id === requested)) return;
    if (!seen.current.has(requested)) setNotice(true);
    void navigate({ search: ({ view: _, ...rest }) => rest, replace: true });
  }, [requested, list, navigate]);

  useEffect(() => {
    if (views.saveError) toast.error(`The view wasn't saved: ${errorMessage(views.saveError)}`);
  }, [views.saveError]);

  const saved = active ? fromDefinition(active.definition) : remembered.value;
  const view: LibraryView = { ...saved, q: search.q };
  const change = (next: Partial<LibraryView>) => {
    const { q, ...rest } = next;
    if (active && Object.keys(rest).length > 0) views.edit(active.id, toDefinition({ ...saved, ...rest }));
    if (q !== undefined) {
      void navigate({ search: (prev) => ({ ...prev, q: q || undefined }), replace: true });
    }
  };
  const select = (id: string) => {
    setNotice(false);
    void navigate({ search: (prev) => ({ ...(prev.q ? { q: prev.q } : {}), view: id }) });
  };
  const showEverything = () => {
    if (!active) return;
    const before = active.definition;
    views.edit(active.id, toDefinition(withoutFilters(saved)));
    toast("The view's filters are off.", {
      action: { label: "Undo", onClick: () => views.edit(active.id, before) },
    });
  };

  const all = library.data ?? [];
  const shown = viewLibrary(all, view);
  const filtered = activeFilters(view);
  const unsearched = search.q ? viewLibrary(all, { ...view, q: undefined }).length : shown.length;
  const label = filtered > 0 ? `Filter, sort and display (${filtered} filters on)` : "Filter, sort and display";
  const name = active?.name ?? FIRST_VIEW;

  return (
    <>
      {/* One row: the view and count, the search (an icon on phones) and the sheet's button. */}
      <header className="mb-4 flex min-h-10 items-center gap-1 md:mb-6 md:gap-2">
        <div className={cn("mr-auto flex min-w-0 items-baseline gap-2", searching && "hidden md:flex")}>
          {active && list ? (
            <ViewSwitcher
              name={name}
              views={list}
              activeId={active.id}
              onSelect={select}
              onNew={() => setCreating(true)}
              onManage={() => setManaging(true)}
            />
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          )}
          {library.data ? (
            <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
              {shown.length === all.length
                ? `${all.length} ${all.length === 1 ? "work" : "works"}`
                : `${shown.length} of ${all.length}`}
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
              disabled={!active}
              className={cn(filtered > 0 && "text-primary")}
              onClick={() => setSheet(true)}
            >
              <ListFilter aria-hidden />
            </Button>
          </>
        ) : null}
      </header>
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="flex-1">That view isn't one of yours, or it was deleted. Here is your default view.</p>
          <Button
            variant="ghost"
            size="icon"
            className="-my-1.5 size-7"
            aria-label="Dismiss"
            onClick={() => setNotice(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
      {views.query.error ? (
        <ErrorAlert
          error={views.query.error}
          title="Your library views didn't load"
          onRetry={() => void views.query.refetch()}
        />
      ) : null}
      {library.error ? <ErrorAlert error={library.error} onRetry={() => void library.refetch()} /> : null}
      {library.isPending || views.query.isPending ? <Loading /> : null}
      {library.data?.length === 0 ? (
        <EmptyState icon={<LibraryBig />} title="Your library is empty">
          <p>Find works in the catalogue and add them here.</p>
          <Button asChild className="mt-4">
            <Link to="/browse">Browse the catalogue</Link>
          </Button>
        </EmptyState>
      ) : null}
      {!views.query.isPending && all.length > 0 && shown.length === 0 ? (
        search.q && unsearched > 0 ? (
          <EmptyState icon={<Search />} title="Nothing matches">
            <Button variant="link" onClick={() => change({ q: "" })}>
              Clear the search
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={<Search />} title="Nothing in this view">
            {active ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => setSheet(true)}>
                  Edit view
                </Button>
                {filtered > 0 ? <Button onClick={showEverything}>Show everything</Button> : null}
              </div>
            ) : null}
          </EmptyState>
        )
      ) : null}
      {views.query.isPending ? null : shown.length > 0 && view.layout === "list" ? (
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
      {active ? (
        <LibrarySheet
          open={sheet}
          onOpenChange={setSheet}
          name={active.name}
          view={view}
          entries={all}
          onChange={change}
          onReset={() => views.edit(active.id, toDefinition(DEFAULT_VIEW))}
        />
      ) : null}
      <NewViewDialog
        open={creating}
        onOpenChange={setCreating}
        views={views}
        current={active ? { name: active.name, definition: active.definition } : undefined}
        onCreated={(created) => {
          select(created.id);
          setSheet(true);
        }}
      />
      <ManageViewsSheet open={managing} onOpenChange={setManaging} views={views} />
    </>
  );
}
