// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, EllipsisVertical, Layers, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { ScrollStrip } from "@/components/scroll-strip";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cover } from "@/features/catalog/cover";
import { label, STATUS_LABELS, TYPE_LABELS } from "@/features/catalog/labels";
import { LIBRARY_INDEX_KEY } from "@/features/catalog/library-index";
import { useChapterPrefs } from "@/features/works/chapter-order";
import type { ChapterView } from "@/features/works/chapter-view";
import { ChaptersPanel } from "@/features/works/chapters-panel";
import { SeriesChaptersPanel } from "@/features/works/series-chapters";
import { SourcesPanel } from "@/features/works/sources-panel";
import { cn } from "@/lib/utils";

type Work = components["schemas"]["Work"];

/** "chapters", "sources", or "series:<id>" for one source's own list. */
type Tab = string;

interface WorkSearch {
  tab?: Tab;
  /** Chosen here; without them, the user's remembered view (newest first by default). */
  order?: ChapterView["order"];
  sort?: ChapterView["sort"];
  display?: ChapterView["display"];
  unread?: true;
  downloaded?: true;
  bookmarked?: true;
  scanlator?: string;
}

const flag = (value: unknown) => value === true || value === "true";

export const Route = createFileRoute("/_app/works/$workId")({
  validateSearch: (search: Record<string, unknown>): WorkSearch => ({
    ...(typeof search.tab === "string" && /^(chapters|sources|series:[0-9a-f-]{36})$/.test(search.tab)
      ? { tab: search.tab }
      : {}),
    ...(search.order === "desc" || search.order === "asc" ? { order: search.order } : {}),
    ...(search.sort === "number" || search.sort === "date" ? { sort: search.sort } : {}),
    ...(search.display === "title" || search.display === "number" ? { display: search.display } : {}),
    ...(flag(search.unread) ? { unread: true as const } : {}),
    ...(flag(search.downloaded) ? { downloaded: true as const } : {}),
    ...(flag(search.bookmarked) ? { bookmarked: true as const } : {}),
    ...(typeof search.scanlator === "string" && search.scanlator ? { scanlator: search.scanlator } : {}),
  }),
  component: WorkPage,
});

function WorkPage() {
  const { workId } = Route.useParams();
  const router = useRouter();
  const work = $api.useQuery("get", "/works/{work_id}", { params: { path: { work_id: workId } } });
  // Back where the page was opened from; opened directly (a link, a bookmark), the library.
  const back = () => (router.history.canGoBack() ? router.history.back() : void router.navigate({ to: "/" }));
  return (
    <>
      <PhoneTopBar title={work.data?.title} entryId={work.data?.entry_id} onBack={back} />
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 hidden sm:inline-flex" onClick={back}>
        <ArrowLeft aria-hidden />
        Back
      </Button>
      {isApiError(work.error, "not_found") ? (
        <EmptyState title="Work not found">It doesn't exist, or you can't see it.</EmptyState>
      ) : work.error ? (
        <ErrorAlert error={work.error} onRetry={() => void work.refetch()} />
      ) : null}
      {work.isPending ? <Loading /> : null}
      {work.data ? <WorkDetails work={work.data} /> : null}
    </>
  );
}

function WorkDetails({ work }: { work: Work }) {
  const search = Route.useSearch();
  const attached = work.sources.filter((s) => s.attached);
  const requested = search.tab ?? "chapters";
  // A source tab whose series was detached falls back to the chapters.
  const tab =
    requested.startsWith("series:") && !attached.some((s) => `series:${s.attached?.id}` === requested)
      ? "chapters"
      : requested;
  const navigate = useNavigate({ from: Route.fullPath });
  const prefs = useChapterPrefs();
  const view: ChapterView = {
    order: search.order ?? prefs.saved.order,
    sort: search.sort ?? prefs.saved.sort,
    display: search.display ?? prefs.saved.display,
    unread: search.unread ?? false,
    downloaded: search.downloaded ?? false,
    bookmarked: search.bookmarked ?? false,
    scanlator: search.scanlator,
  };
  return (
    <>
      <header className="mb-4 flex gap-3 sm:mb-6 sm:gap-6">
        <Cover url={work.cover_url} title={work.title} eager className="w-20 shrink-0 shadow-md sm:w-36" />
        <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
          <h1
            id="series-title"
            className="text-lg leading-snug font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl"
          >
            {work.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[label(TYPE_LABELS, work.type), work.year, label(STATUS_LABELS, work.status)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <LibraryButton work={work} />
            {/* On phones, Details is in the top bar's menu. */}
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/catalog/$entryId" params={{ entryId: work.entry_id }}>
                <BookOpen aria-hidden />
                Details
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            search: (prev) => ({ ...prev, tab: value === "chapters" ? undefined : value }),
            replace: true,
          })
        }
      >
        <ScrollStrip>
          <TabsList>
            <TabsTrigger value="chapters">Chapters</TabsTrigger>
            {attached.map((state) => (
              <TabsTrigger key={state.attached?.id} value={`series:${state.attached?.id}`}>
                {state.source.name}{" "}
                <span className="text-xs font-normal text-muted-foreground uppercase">{state.source.lang}</span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>
        </ScrollStrip>
        <TabsContent value="chapters" className="mt-4">
          <ChaptersPanel
            work={work}
            view={view}
            onViewChange={(change) => {
              const next = { ...view, ...change };
              prefs.remember({ order: next.order, sort: next.sort, display: next.display });
              void navigate({
                search: (prev) => ({
                  ...prev,
                  order: next.order,
                  sort: next.sort,
                  display: next.display,
                  unread: next.unread ? true : undefined,
                  downloaded: next.downloaded ? true : undefined,
                  bookmarked: next.bookmarked ? true : undefined,
                  scanlator: next.scanlator,
                }),
                replace: true,
              });
            }}
          />
        </TabsContent>
        {attached.map((state) =>
          state.attached ? (
            <TabsContent key={state.attached.id} value={`series:${state.attached.id}`} className="mt-4">
              <SeriesChaptersPanel workId={work.id} seriesId={state.attached.id} />
            </TabsContent>
          ) : null,
        )}
        <TabsContent value="sources" className="mt-4">
          <SourcesPanel work={work} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Phones: back, the series' title (once its heading has scrolled away) and a menu, in a bar
 * that stays under the status bar, as in native apps.
 */
function PhoneTopBar({
  title,
  entryId,
  onBack,
}: {
  title: string | undefined;
  entryId: string | undefined;
  onBack: () => void;
}) {
  const navigate = useNavigate({ from: Route.fullPath });
  const [titled, setTitled] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the heading is there once the title is
  useEffect(() => {
    const heading = document.getElementById("series-title");
    if (!heading) return;
    // The title shows in the bar once the page's own heading has gone under it.
    const update = () =>
      setTitled(heading.getBoundingClientRect().bottom <= (bar.current?.getBoundingClientRect().bottom ?? 0));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [title]);
  return (
    <div
      ref={bar}
      className="sticky top-[var(--safe-top)] z-30 -mx-4 -mt-4 mb-2 flex h-12 items-center gap-1 bg-background/90 px-2 backdrop-blur sm:hidden"
    >
      <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
        <ArrowLeft aria-hidden />
      </Button>
      <p
        aria-hidden
        className={cn(
          "min-w-0 flex-1 truncate text-base font-semibold transition-opacity",
          titled ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Series menu">
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entryId ? (
            <DropdownMenuItem asChild>
              <Link to="/catalog/$entryId" params={{ entryId }}>
                <BookOpen aria-hidden />
                Details
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => void navigate({ search: (prev) => ({ ...prev, tab: "sources" }), replace: true })}
          >
            <Layers aria-hidden />
            Sources
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LibraryButton({ work }: { work: Work }) {
  const { user } = useMe();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LIBRARY_INDEX_KEY });
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[1] === "/works/{work_id}" || q.queryKey[1] === "/library",
    });
  };
  const add = $api.useMutation("post", "/library", {
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = $api.useMutation("delete", "/library/{work_id}", {
    onSuccess: () => {
      refresh();
      toast.success(`Removed ${work.title} from your library.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!work.in_library) {
    const mayAdd = user.role === "admin" || user.grants.may_add;
    return (
      <Button
        size="sm"
        disabled={!mayAdd || add.isPending}
        onClick={() => add.mutate({ body: { entry_id: work.entry_id } })}
      >
        <Plus aria-hidden />
        Add to library
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Check aria-hidden />
          In library
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {work.title} from your library?</AlertDialogTitle>
          <AlertDialogDescription>
            Your reading progress stays, and downloaded chapters stay too: they're shared with everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => remove.mutate({ params: { path: { work_id: work.id } } })}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
