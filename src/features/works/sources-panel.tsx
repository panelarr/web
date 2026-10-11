// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Link2, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { formValues, TextField } from "@/components/form";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HealthBadge } from "@/features/admin/health-badge";
import { Cover } from "@/features/catalog/cover";
import { cn } from "@/lib/utils";

type Work = components["schemas"]["Work"];
type SourceState = components["schemas"]["WorkSourceState"];
type Series = components["schemas"]["MatchSeries"];

const STATUS: Record<SourceState["status"], { label: string; className: string }> = {
  unchecked: { label: "Not searched yet", className: "text-muted-foreground" },
  pending: { label: "Searching…", className: "text-info" },
  matched: { label: "Matched", className: "text-success" },
  candidates: { label: "Needs a decision", className: "text-warning" },
  no_match: { label: "Not found", className: "text-muted-foreground" },
  failed: { label: "Search failed", className: "text-destructive" },
};

/** "Matched “Tsukiyo no Panya” · title 82% · authors match · 21 chapters" */
export function evidenceText(series: Series): string {
  const e = series.evidence;
  return [
    e.matched_title ? `matched “${e.matched_title}”` : undefined,
    `title ${Math.round(e.title_score * 100)}%`,
    e.authors_match === undefined ? undefined : e.authors_match ? "authors match" : "authors differ",
    e.chapter_count !== undefined ? `${e.chapter_count} chapters` : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(/^./, (c) => c.toUpperCase());
}

function useWorkMutations(work: Work) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[1] === "string" && q.queryKey[1].startsWith("/works"),
    });
    void queryClient.invalidateQueries({ queryKey: ["library-index"] });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  return {
    attach: $api.useMutation("post", "/works/{work_id}/series/{series_id}/attach", { onSuccess: refresh, onError }),
    detach: $api.useMutation("post", "/works/{work_id}/series/{series_id}/detach", { onSuccess: refresh, onError }),
    priority: $api.useMutation("patch", "/works/{work_id}/series/{series_id}", { onSuccess: refresh, onError }),
    add: $api.useMutation("post", "/works/{work_id}/series", { onSuccess: refresh }),
    match: $api.useMutation("post", "/works/{work_id}/match", {
      onSuccess: () => {
        refresh();
        toast.success(`Searching the sources for ${work.title}…`);
      },
      onError,
    }),
    path: (seriesId: string) => ({ params: { path: { work_id: work.id, series_id: seriesId } } }),
  };
}

export type WorkMutations = ReturnType<typeof useWorkMutations>;

/** How the work is matched on each source, with what's needed to fix it. */
export function SourcesPanel({ work }: { work: Work }) {
  const { user } = useMe();
  const canFix = user.role === "admin" || user.grants.may_manage_matches;
  const m = useWorkMutations(work);
  const [byUrl, setByUrl] = useState(false);
  const attached = work.sources.filter((s) => s.attached).length;

  if (work.sources.length === 0) {
    return (
      <EmptyState title="No sources to search">
        There are no sources you can use. {user.role === "admin" ? "Add a source plugin in Admin." : "Ask your admin."}
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Attached on {attached} of {work.sources.length} {work.sources.length === 1 ? "source" : "sources"}.
          {canFix ? null : " Ask your admin to fix matches."}
        </p>
        {canFix ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setByUrl(true)}>
              <Link2 aria-hidden />
              Attach by URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={m.match.isPending}
              onClick={() => m.match.mutate({ params: { path: { work_id: work.id } }, body: {} })}
            >
              <RefreshCw className={m.match.isPending ? "animate-spin" : undefined} aria-hidden />
              Search again
            </Button>
          </>
        ) : null}
      </div>
      <ul className="grid gap-3">
        {work.sources.map((state) => (
          <SourceRow key={state.source.id} work={work} state={state} canFix={canFix} m={m} />
        ))}
      </ul>
      <AttachUrlDialog work={work} open={byUrl} onOpenChange={setByUrl} m={m} />
    </div>
  );
}

function SourceRow({ work, state, canFix, m }: { work: Work; state: SourceState; canFix: boolean; m: WorkMutations }) {
  const [searching, setSearching] = useState(false);
  const status = STATUS[state.status];
  const candidates = state.candidates.filter((c) => c.state === "candidate");
  const rejected = state.candidates.filter((c) => c.state === "rejected");
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceIcon name={state.source.name} url={state.source.icon_url} className="size-7" />
        <span className="font-medium [overflow-wrap:anywhere]">{state.source.name}</span>
        <Badge variant="outline" className="uppercase">
          {state.source.lang}
        </Badge>
        {state.source.health.status !== "ok" ? <HealthBadge status={state.source.health.status} /> : null}
        <span className={cn("ml-auto inline-flex items-center gap-1 text-sm font-medium", status.className)}>
          {state.status === "pending" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {status.label}
        </span>
      </div>
      {state.message ? <p className="text-sm text-destructive [overflow-wrap:anywhere]">{state.message}</p> : null}
      {state.queries.length > 0 && !state.attached ? (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Searched: {state.queries.join(" · ")}</p>
      ) : null}
      {state.attached ? <AttachedSeries work={work} series={state.attached} canFix={canFix} m={m} /> : null}
      {candidates.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">{state.attached ? "Other candidates" : "Is it one of these?"}</p>
          <ul className="grid gap-2">
            {candidates.map((series) => (
              <SeriesRow key={series.id} series={series}>
                {canFix ? (
                  <>
                    <Button size="sm" disabled={m.attach.isPending} onClick={() => m.attach.mutate(m.path(series.id))}>
                      <Check aria-hidden />
                      Attach
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Not ${series.title}`}
                      disabled={m.detach.isPending}
                      onClick={() => m.detach.mutate(m.path(series.id))}
                    >
                      <X aria-hidden />
                      Not it
                    </Button>
                  </>
                ) : null}
              </SeriesRow>
            ))}
          </ul>
        </div>
      ) : null}
      {rejected.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {rejected.length} rejected {rejected.length === 1 ? "series" : "series"}
          </summary>
          <ul className="mt-2 grid gap-2">
            {rejected.map((series) => (
              <SeriesRow key={series.id} series={series}>
                {canFix ? (
                  <Button size="sm" variant="outline" onClick={() => m.attach.mutate(m.path(series.id))}>
                    Attach anyway
                  </Button>
                ) : null}
              </SeriesRow>
            ))}
          </ul>
        </details>
      ) : null}
      {canFix && state.source.capabilities.includes("search") ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSearching(true)}>
            <Search aria-hidden />
            Search {state.source.name} yourself
          </Button>
          <SearchSourceDialog work={work} state={state} open={searching} onOpenChange={setSearching} m={m} />
        </div>
      ) : null}
    </li>
  );
}

function AttachedSeries({
  work,
  series,
  canFix,
  m,
}: {
  work: Work;
  series: Series;
  canFix: boolean;
  m: WorkMutations;
}) {
  const [priority, setPriority] = useState(String(series.priority));
  const priorityId = useId();
  const save = () => {
    const value = Number(priority);
    if (!Number.isInteger(value) || value === series.priority) return;
    m.priority.mutate({ ...m.path(series.id), body: { priority: Math.max(-1000, Math.min(1000, value)) } });
  };
  return (
    <SeriesRow series={series} attached>
      {canFix ? (
        <>
          <div className="flex items-center gap-1.5">
            <label htmlFor={priorityId} className="text-xs text-muted-foreground">
              Priority
            </label>
            <Input
              id={priorityId}
              type="number"
              inputMode="numeric"
              title={`Priority of ${series.title} for ${work.title}`}
              className="h-8 w-20"
              min={-1000}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={m.detach.isPending}
            onClick={() => m.detach.mutate(m.path(series.id))}
          >
            Detach
          </Button>
        </>
      ) : null}
    </SeriesRow>
  );
}

function SeriesRow({ series, attached, children }: { series: Series; attached?: boolean; children?: React.ReactNode }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border p-2.5",
        attached ? "border-success/40 bg-success/5" : "bg-background",
      )}
    >
      <Cover url={series.cover_url} title={series.title} className="w-10 shrink-0 rounded" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium [overflow-wrap:anywhere]">
          {series.title}
          {series.url ? (
            <a
              href={series.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={`Open ${series.title} on the source`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {attached ? (
            <Badge variant="secondary">{series.origin === "auto" ? "Attached automatically" : "Attached"}</Badge>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{evidenceText(series)}</p>
        {series.evidence.source_authors.length > 0 ? (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            By {series.evidence.source_authors.join(", ")}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </li>
  );
}

function AttachUrlDialog({
  work,
  open,
  onOpenChange,
  m,
}: {
  work: Work;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  m: WorkMutations;
}) {
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) m.add.reset();
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            m.add.mutate(
              { params: { path: { work_id: work.id } }, body: { url: formValues(event.currentTarget).url ?? "" } },
              {
                onSuccess: (series) => {
                  toast.success(`Attached ${series.title}.`);
                  close(false);
                },
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Attach by URL</DialogTitle>
            <DialogDescription>Paste the address of the series on a source's site.</DialogDescription>
          </DialogHeader>
          {m.add.error ? <ErrorAlert error={m.add.error} title="Not attached" /> : null}
          <TextField label="Series URL" name="url" type="url" required autoFocus />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.add.isPending}>
              {m.add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Attach
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SearchSourceDialog({
  work,
  state,
  open,
  onOpenChange,
  m,
}: {
  work: Work;
  state: SourceState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  m: WorkMutations;
}) {
  const [query, setQuery] = useState(work.title);
  const search = $api.useMutation("post", "/sources/{source_id}/search");
  const run = () => search.mutate({ params: { path: { source_id: state.source.id } }, body: { query, page: 1 } });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && !search.data) run();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Search {state.source.name}</DialogTitle>
          <DialogDescription>Find {work.title} on this source and attach it.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <Input aria-label="Search the source" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="outline" disabled={search.isPending}>
            {search.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            Search
          </Button>
        </form>
        {search.error ? <ErrorAlert error={search.error} /> : null}
        {search.data?.series.length === 0 ? <p className="text-sm text-muted-foreground">Nothing found.</p> : null}
        <ul className="grid gap-2">
          {search.data?.series.map((series) => (
            <li key={series.key} className="flex items-center gap-3 rounded-lg border p-2.5">
              <Cover url={series.cover_url} title={series.title} className="w-10 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{series.title}</p>
                <p className="truncate text-xs text-muted-foreground">{series.authors.join(", ")}</p>
              </div>
              <Button
                size="sm"
                disabled={m.add.isPending}
                onClick={() =>
                  m.add.mutate(
                    { params: { path: { work_id: work.id } }, body: { source_id: state.source.id, key: series.key } },
                    {
                      onSuccess: () => {
                        toast.success(`Attached ${series.title}.`);
                        onOpenChange(false);
                      },
                    },
                  )
                }
              >
                Attach
              </Button>
            </li>
          ))}
        </ul>
        {m.add.error ? <ErrorAlert error={m.add.error} title="Not attached" /> : null}
      </DialogContent>
    </Dialog>
  );
}
