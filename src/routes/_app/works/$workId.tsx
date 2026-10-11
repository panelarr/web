// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cover } from "@/features/catalog/cover";
import { label, STATUS_LABELS, TYPE_LABELS } from "@/features/catalog/labels";
import { LIBRARY_INDEX_KEY } from "@/features/catalog/library-index";
import { ChaptersPanel } from "@/features/works/chapters-panel";
import { SeriesChaptersPanel } from "@/features/works/series-chapters";
import { SourcesPanel } from "@/features/works/sources-panel";

type Work = components["schemas"]["Work"];

/** "chapters", "sources", or "series:<id>" for one source's own list. */
type Tab = string;

interface WorkSearch {
  tab?: Tab;
  order?: "desc";
  unread?: true;
}

export const Route = createFileRoute("/_app/works/$workId")({
  validateSearch: (search: Record<string, unknown>): WorkSearch => ({
    ...(typeof search.tab === "string" && /^(chapters|sources|series:[0-9a-f-]{36})$/.test(search.tab)
      ? { tab: search.tab }
      : {}),
    ...(search.order === "desc" ? { order: "desc" as const } : {}),
    ...(search.unread === true || search.unread === "true" ? { unread: true as const } : {}),
  }),
  component: WorkPage,
});

function WorkPage() {
  const { workId } = Route.useParams();
  const router = useRouter();
  const work = $api.useQuery("get", "/works/{work_id}", { params: { path: { work_id: workId } } });
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => router.history.back()}>
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
  return (
    <>
      <header className="mb-6 flex gap-4 sm:gap-6">
        <Cover url={work.cover_url} title={work.title} eager className="w-24 shrink-0 shadow-md sm:w-36" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{work.title}</h1>
          <p className="text-sm text-muted-foreground">
            {[label(TYPE_LABELS, work.type), work.year, label(STATUS_LABELS, work.status)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <LibraryButton work={work} />
            <Button variant="ghost" size="sm" asChild>
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
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="chapters">Chapters</TabsTrigger>
            {attached.map((state) => (
              <TabsTrigger key={state.attached?.id} value={`series:${state.attached?.id}`}>
                {state.source.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chapters" className="mt-4">
          <ChaptersPanel
            work={work}
            view={{ order: search.order ?? "asc", unread: search.unread ?? false }}
            onViewChange={(view) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  order: view.order === "desc" ? "desc" : undefined,
                  unread: view.unread ? true : undefined,
                }),
                replace: true,
              })
            }
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
