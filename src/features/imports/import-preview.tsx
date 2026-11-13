// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, FolderTree, Inbox, Loader2, PackagePlus, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { ApiError, errorMessage } from "@/api/errors";
import { useIsAdmin } from "@/auth/session";
import { ScrollStrip } from "@/components/scroll-strip";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ChooseDialog } from "./choose-dialog";
import {
  applyAction,
  canChoose,
  type Import,
  type ImportItem,
  type ImportState,
  importQuery,
  importsQuery,
  isRunning,
  OUTCOMES,
  type OutcomeTab,
  plural,
  RESULT_LABELS,
  STATE_LABELS,
} from "./imports";

const PAGE_SIZE = 25;

/**
 * One import: what the backup holds, how far matching or applying is, what apply did, and each
 * series by outcome. All of it comes from the server, so a reload (or another device) shows
 * the same; progress follows the user's events.
 */
export function ImportPreview({
  importId,
  outcome,
  onOutcome,
}: {
  importId: string;
  outcome: OutcomeTab | undefined;
  onOutcome: (outcome: OutcomeTab) => void;
}) {
  const query = useQuery(importQuery(importId));
  if (query.error) {
    return (
      <>
        <BackLink />
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!query.data) return <Loading />;
  const item = query.data;
  const counts = new Map(item.outcomes.map((o) => [o.outcome, o.series]));
  const tab = outcome ?? OUTCOMES.find((o) => (counts.get(o.id) ?? 0) > 0)?.id ?? "ready";
  return (
    <>
      <BackLink />
      <PageHeader
        title={`Import of ${formatDateTime(item.created_at)}`}
        description={
          <>
            A Suwayomi or Mihon backup · <span data-testid="import-state">{STATE_LABELS[item.state]}</span>
          </>
        }
        actions={<DeleteImport item={item} />}
      />
      <div className="grid grid-cols-1 gap-4">
        {item.state === "failed" ? (
          <Alert variant="destructive">
            <AlertTitle>The import failed</AlertTitle>
            <AlertDescription className="[overflow-wrap:anywhere]">
              {item.message || "The server didn't say why."}
            </AlertDescription>
          </Alert>
        ) : null}
        {isRunning(item.state) ? <Running item={item} /> : null}
        <ApplyPanel item={item} />
        <Report item={item} />
        <Totals item={item} />
        <PackageHints item={item} />
        <CategoriesNote item={item} />
        {item.state !== "previewing" ? (
          <Tabs value={tab} onValueChange={(value) => onOutcome(value as OutcomeTab)}>
            <ScrollStrip>
              <TabsList>
                {OUTCOMES.map((o) => (
                  <TabsTrigger key={o.id} value={o.id}>
                    {o.label}
                    <Badge variant="secondary" className="ml-1.5 tabular-nums">
                      {formatNumber(counts.get(o.id) ?? 0)}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollStrip>
            {OUTCOMES.map((o) => (
              <TabsContent key={o.id} value={o.id} className="mt-4">
                {o.id === tab ? (
                  <OutcomeList importId={item.id} state={item.state} outcome={o.id} hint={o.hint} />
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        ) : null}
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/settings"
      search={{ tab: "import" }}
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Imports
    </Link>
  );
}

/** Matching or applying, followed live; either can be cancelled. */
function Running({ item }: { item: Import }) {
  const queryClient = useQueryClient();
  const { done, total } = item.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const what = item.state === "applying" ? "Importing series" : "Matching series";
  const cancel = $api.useMutation("post", "/me/imports/{id}/cancel", {
    onSuccess: (cancelled) => {
      queryClient.setQueryData(importQuery(item.id).queryKey, cancelled);
      void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey });
      toast.success(item.state === "applying" ? "Import cancelled: what it applied stays." : "Matching cancelled.");
    },
    onError: (error) => {
      // It finished (or stopped) meanwhile: show where it is now.
      void queryClient.invalidateQueries({ queryKey: importQuery(item.id).queryKey });
      toast.error(
        error instanceof ApiError && error.code === "import_not_running"
          ? "The import had stopped already."
          : `Couldn't cancel the import: ${errorMessage(error)}`,
      );
    },
  });
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-1 items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {what}: {formatNumber(done)} of {formatNumber(total)}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate({ params: { path: { id: item.id } } })}
        >
          {cancel.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Square aria-hidden />}
          Cancel import
        </Button>
      </div>
      <Progress value={pct} aria-label={what} />
      <p className="text-xs text-muted-foreground">
        {item.state === "applying"
          ? "You can leave this page: the import goes on, and what it applied stays even if you cancel it."
          : "You can leave this page: matching goes on, and the import stays under Settings → Import."}
      </p>
    </div>
  );
}

/** Apply a finished preview, or resume a cancelled or failed apply. */
function ApplyPanel({ item }: { item: Import }) {
  const queryClient = useQueryClient();
  const action = applyAction(item);
  const apply = $api.useMutation("post", "/me/imports/{id}/apply", {
    onSuccess: (applying) => {
      queryClient.setQueryData(importQuery(item.id).queryKey, applying);
      void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey }),
  });
  if (!action) return null;
  const counts = new Map(item.outcomes.map((o) => [o.outcome, o.series]));
  const going = (counts.get("ready") ?? 0) + (counts.get("in_library") ?? 0) + (counts.get("source_missing") ?? 0);
  const open = (counts.get("needs_choice") ?? 0) + (counts.get("not_found") ?? 0);
  const run = () => apply.mutate({ params: { path: { id: item.id } } });
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          {action === "apply" ? (
            <>
              <p className="font-medium">
                Apply this import to bring {plural(going, "series", "series")} into your library.
              </p>
              <p className="text-muted-foreground">
                Read chapters keep their times, bookmarks come along, and newer reading in Panelarr always wins.
                {open > 0
                  ? ` Choose or skip the ${plural(open, "series", "series")} that need it, before or after.`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">The import stopped before it was done.</p>
              <p className="text-muted-foreground">Resume it to go on with the series it hasn't applied yet.</p>
            </>
          )}
        </div>
        {action === "apply" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={apply.isPending}>
                {apply.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                Apply import
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apply this import?</AlertDialogTitle>
                <AlertDialogDescription>
                  {plural(going, "series", "series")} go into your library with their read chapters and bookmarks.
                  Nothing you read in Panelarr is undone. Deleting the import later doesn't take them out again: use
                  Remove and Mark unread for that.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction onClick={run}>Apply</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button disabled={apply.isPending} onClick={run}>
            {apply.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            Resume import
          </Button>
        )}
      </div>
      {apply.error ? <ApplyError error={apply.error} /> : null}
    </div>
  );
}

function ApplyError({ error }: { error: unknown }) {
  const imports = useQuery(importsQuery());
  const running = imports.data?.imports.find((i) => isRunning(i.state));
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "import_running") {
    return (
      <Alert>
        <AlertTitle>Another import is running</AlertTitle>
        <AlertDescription>
          <p>One import at a time: wait for it to finish or cancel it, then apply this one.</p>
          {running ? (
            <Link
              to="/settings/imports/$importId"
              params={{ importId: running.id }}
              className="mt-1 font-medium text-foreground underline underline-offset-4"
            >
              Open the running import
            </Link>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (code === "import_state") {
    return (
      <Alert variant="destructive">
        <AlertTitle>This import can't be applied</AlertTitle>
        <AlertDescription className="[overflow-wrap:anywhere]">{errorMessage(error)}</AlertDescription>
      </Alert>
    );
  }
  return <ErrorAlert error={error} title="The import didn't start" />;
}

/** What apply did: series imported, already imported and skipped, and times it capped. */
function Report({ item }: { item: Import }) {
  if (item.results.length === 0) return null;
  const counts = new Map(item.results.map((r) => [r.result, r.series]));
  const clamped = item.summary.clamped_times ?? 0;
  return (
    <section aria-label="Report" className="grid gap-2">
      <dl className="grid grid-cols-3 gap-2">
        {(["applied", "already_imported", "skipped"] as const).map((result) => (
          <div key={result} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{RESULT_LABELS[result]}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(counts.get(result) ?? 0)}</dd>
          </div>
        ))}
      </dl>
      {clamped > 0 ? (
        <Alert>
          <Clock aria-hidden />
          <AlertTitle>{plural(clamped, "last-read time")} in the future</AlertTitle>
          <AlertDescription>
            The other app's clock was probably off. They were set to when the import ran, so History shows them then.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

function Totals({ item }: { item: Import }) {
  const s = item.summary;
  const tiles: Array<[string, number]> = [
    ["Series", s.series],
    ["Chapters read", s.chapters_read],
    ["Bookmarks", s.bookmarks],
    ["In progress", s.in_progress],
  ];
  const left = [
    s.out_of_library > 0 ? `${plural(s.out_of_library, "series", "series")} outside the library` : "",
    s.tracker_links > 0 ? plural(s.tracker_links, "tracker link") : "",
  ].filter(Boolean);
  return (
    <section aria-label="Totals" className="grid gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
      {left.length > 0 ? (
        <p className="text-xs text-muted-foreground">Also in the backup, not imported: {left.join(", ")}.</p>
      ) : null}
    </section>
  );
}

function PackageHints({ item }: { item: Import }) {
  const isAdmin = useIsAdmin();
  const hints = item.summary.package_hints;
  if (hints.length === 0) return null;
  const series = hints.reduce((n, h) => n + h.series, 0);
  return (
    <Alert>
      <PackagePlus aria-hidden />
      <AlertTitle>
        {plural(series, "series", "series")} could get their source from {hints.length === 1 ? "a package" : "packages"}
      </AlertTitle>
      <AlertDescription>
        <ul className="grid gap-1">
          {hints.map((hint) => (
            <li key={`${hint.plugin_id}/${hint.package_id}`} className="[overflow-wrap:anywhere]">
              Installing {hint.package_name} would attach {plural(hint.series, "series", "series")}.
              {isAdmin ? (
                <>
                  {" "}
                  <Link
                    to="/admin/plugins/$pluginId"
                    params={{ pluginId: hint.plugin_id }}
                    search={{ tab: "extensions", pkg: hint.package_id }}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Open {hint.package_name} in Extensions
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-1">
          {isAdmin
            ? "Once it's installed, import the backup again to attach them."
            : "Ask an admin to install it; then import the backup again to attach them."}
        </p>
      </AlertDescription>
    </Alert>
  );
}

function CategoriesNote({ item }: { item: Import }) {
  const categories = item.summary.categories;
  if (categories.length === 0) return null;
  return (
    <Alert>
      <FolderTree aria-hidden />
      <AlertTitle>Categories aren't imported yet: {plural(categories.length, "category", "categories")}</AlertTitle>
      <AlertDescription className="[overflow-wrap:anywhere]">
        {categories.map((c) => `${c.name} (${formatNumber(c.series)})`).join(", ")}
      </AlertDescription>
    </Alert>
  );
}

function OutcomeList({
  importId,
  state,
  outcome,
  hint,
}: {
  importId: string;
  state: ImportState;
  outcome: OutcomeTab;
  hint: string;
}) {
  const items = useInfiniteQuery({
    queryKey: ["get", "/me/imports/{id}/items", { id: importId, outcome }],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/me/imports/{id}/items", {
        params: {
          path: { id: importId },
          query: { outcome, page_size: PAGE_SIZE, ...(pageParam ? { page_token: pageParam } : {}) },
        },
      });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
  });
  const list = items.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-muted-foreground">{hint}</p>
      {items.error ? <ErrorAlert error={items.error} onRetry={() => void items.refetch()} /> : null}
      {items.isPending ? <Loading /> : null}
      {items.data && list.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No series here" className="py-10" />
      ) : null}
      {list.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-label="Series">
          {list.map((row) => (
            <li key={row.idx}>
              <ItemRow importId={importId} state={state} item={row} />
            </li>
          ))}
        </ul>
      ) : null}
      {items.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>
            {items.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            More series
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({ importId, state, item }: { importId: string; state: ImportState; item: ImportItem }) {
  const [choosing, setChoosing] = useState(false);
  const details = [
    item.source_name || "Unknown source",
    `${plural(item.chapters_read, "chapter")} read`,
    item.bookmarks > 0 ? plural(item.bookmarks, "bookmark") : "",
    item.outcome === "needs_choice" && item.candidates.length > 0
      ? plural(item.candidates.length, "possible match", "possible matches")
      : "",
  ].filter(Boolean);
  const placed =
    item.result === "applied" || item.result === "already_imported"
      ? [
          `${plural(item.placed, "chapter")} placed`,
          item.pending > 0 ? `${formatNumber(item.pending)} waiting for their chapters` : "",
          item.unplaced > 0 ? `${formatNumber(item.unplaced)} couldn't be placed` : "",
        ].filter(Boolean)
      : [];
  const choosable = canChoose(item) && !isRunning(state);
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium [overflow-wrap:anywhere]">
          {item.title}
          {item.result ? (
            <Badge variant={item.result === "skipped" ? "outline" : "secondary"} className="ml-2 align-middle">
              {RESULT_LABELS[item.result]}
            </Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{details.join(" · ")}</p>
        {placed.length > 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{placed.join(" · ")}</p>
        ) : null}
        {item.message ? <p className="mt-1 text-xs [overflow-wrap:anywhere]">{item.message}</p> : null}
      </div>
      {choosable ? (
        <>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={`Choose the work for ${item.title}`}
            onClick={() => setChoosing(true)}
          >
            Choose
          </Button>
          {choosing ? <ChooseDialog importId={importId} row={item} open={choosing} onOpenChange={setChoosing} /> : null}
        </>
      ) : null}
    </div>
  );
}

function DeleteImport({ item }: { item: Import }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = $api.useMutation("delete", "/me/imports/{id}", {
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: importQuery(item.id).queryKey });
      void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey });
      toast.success("Import deleted");
      await navigate({ to: "/settings", search: { tab: "import" } });
    },
    onError: (error) => toast.error(`Couldn't delete the import: ${errorMessage(error)}`),
  });
  const applied = item.state === "applying" || item.results.some((r) => r.result !== "skipped");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={remove.isPending}>
          {remove.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this import?</AlertDialogTitle>
          <AlertDialogDescription>
            {isRunning(item.state) ? "It stops, and its " : "Its "}
            preview and series list go.{" "}
            {applied ? "What it already brought into your library stays there." : "Nothing in your library changes."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate({ params: { path: { id: item.id } } })}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
