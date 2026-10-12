// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkOptions, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Loader2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";
import { cronText, duration, triggerText } from "@/features/jobs/jobs";
import { RunStatusBadge } from "@/features/jobs/run-status";
import { POLL } from "@/features/jobs/use-jobs";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Provider = components["schemas"]["MetaProviderDetail"];
type SyncRun = components["schemas"]["MetaSyncRun"];
type SyncKind = NonNullable<components["schemas"]["RunMetaSyncRequest"]["kind"]>;

const OWNER = "the metadata service";
const KINDS: Record<string, string> = { dump: "Full sync", delta: "Changes" };
const kindLabel = (kind: string) => KINDS[kind] ?? kind;
const isKind = (kind: string): kind is SyncKind => kind === "dump" || kind === "delta";

/** A provider and a sync run picked in the page's search (?tab=providers&provider=…&sync=…). */
export interface ProvidersSearch {
  provider?: string;
  sync?: string;
}

export function providersSearch(search: Record<string, unknown>): ProvidersSearch {
  const out: ProvidersSearch = {};
  if (typeof search.provider === "string" && search.provider) out.provider = search.provider;
  if (typeof search.sync === "string" && search.sync) out.sync = search.sync;
  return out;
}

const to = "/admin/metadata" as const;
const providersLink: LinkOptions = { to, search: { tab: "providers" } };
const providerLink = (provider: string): LinkOptions => ({ to, search: { tab: "providers", provider } });
const syncLink = (provider: string, sync: string): LinkOptions => ({
  to,
  search: { tab: "providers", provider, sync },
});

/**
 * A schedule from meta's configuration: cron in words (meta runs cron in UTC unless the
 * expression names a zone), anything else as written.
 */
function scheduleText(schedule: string): string {
  const named = /^(CRON_TZ|TZ)=/.test(schedule.trim());
  const fields = schedule.trim().split(/\s+/).length - (named ? 1 : 0);
  return fields === 5 ? cronText(schedule, named ? undefined : "UTC") : schedule;
}

/** "312 received · 41 changed · 4 merged": what a run did, leaving out the zeros. */
function countsText(run: SyncRun): string {
  const parts: Array<[number, string]> = [
    [run.upserts, "received"],
    [run.changed, "changed"],
    [run.removals, "removed"],
    [run.merges, "merged"],
    [run.skipped, "skipped"],
    [run.marked_removed, "marked removed"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n.toLocaleString()} ${what}`)
    .join(" · ");
}

/** The metadata service's providers, their sync runs, and starting a sync. */
export function ProvidersPanel({ search }: { search: ProvidersSearch }) {
  if (search.provider && search.sync) return <SyncRunView provider={search.provider} runId={search.sync} />;
  if (search.provider) return <SyncRuns provider={search.provider} />;
  return <ProviderList />;
}

const providersOptions = () => $api.queryOptions("get", "/system/meta/providers");

function ProviderList() {
  const providers = useQuery({
    ...providersOptions(),
    // meta sends no events: while a sync runs, ask again now and then.
    refetchInterval: (query) =>
      query.state.data?.providers.some((p) => p.last_runs.some((r) => r.status === "running")) ? POLL.listMs : false,
  });
  return (
    <>
      {providers.error ? <ErrorAlert error={providers.error} onRetry={() => void providers.refetch()} /> : null}
      {providers.isPending ? <Loading /> : null}
      {providers.data?.providers.length === 0 ? (
        <EmptyState title="No providers">The metadata service has no provider configured.</EmptyState>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {providers.data?.providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const schedules = Object.entries(provider.schedules);
  const kinds = schedules.map(([kind]) => kind).filter(isKind);
  const running = provider.last_runs.some((run) => run.status === "running");
  const start = $api.useMutation("post", "/system/meta/providers/{provider}/sync", {
    onSuccess: (started, variables) => {
      void queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[1] === "string" && q.queryKey[1].startsWith("/system/meta/"),
      });
      toast.success(`${kindLabel(variables.body?.kind ?? "dump")} of ${provider.id} started.`, {
        action: { label: "Watch", onClick: () => void navigate(syncLink(provider.id, started.run_id)) },
      });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3" className="[overflow-wrap:anywhere]">
          {provider.plugin_name ?? provider.id}
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          {[provider.id, provider.plugin_version, `runs as ${provider.mode}`].filter(Boolean).join(" · ")}
        </CardDescription>
        <CardAction>
          <Link
            {...providerLink(provider.id)}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label={`${provider.id}: sync runs`}
          >
            Runs
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <HealthBadge status={provider.health} />
          <span className="tabular-nums">{provider.record_count.toLocaleString()} records</span>
        </p>
        {provider.health_message ? (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{provider.health_message}</p>
        ) : null}
        {schedules.length > 0 ? (
          <ul className="grid gap-0.5 text-xs text-muted-foreground" aria-label="Schedules">
            {schedules.map(([kind, schedule]) => (
              <li key={kind}>
                {kindLabel(kind)}: {scheduleText(schedule)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Synced by hand only.</p>
        )}
        {provider.last_runs.length > 0 ? (
          <ul className="divide-y rounded-lg border" aria-label="Last runs">
            {provider.last_runs.map((run) => (
              <li key={run.id}>
                <SyncRunRow run={run} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Never synced.</p>
        )}
        {start.error ? <ErrorAlert error={start.error} title="The sync didn't start" /> : null}
        <div className="flex flex-wrap gap-2">
          {(kinds.length > 0 ? kinds : (["dump"] as SyncKind[])).map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              disabled={start.isPending || running}
              onClick={() => start.mutate({ params: { path: { provider: provider.id } }, body: { kind } })}
            >
              {start.isPending && start.variables?.body?.kind === kind ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Play aria-hidden />
              )}
              {kind === "dump" ? "Start a full sync" : "Sync changes"}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SyncRunRow({ run }: { run: SyncRun }) {
  const counts = countsText(run);
  return (
    <Link {...syncLink(run.provider, run.id)} className="flex items-center gap-3 px-3 py-2 hover:bg-accent">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RunStatusBadge status={run.status} />
          <span className="text-sm">{kindLabel(run.kind)}</span>
          {run.started_at ? (
            <span className="text-xs text-muted-foreground" title={formatDateTime(run.started_at)}>
              {formatRelative(run.started_at)} {triggerText(run.trigger, OWNER)}
            </span>
          ) : null}
        </p>
        {run.error ? (
          <p className="mt-0.5 text-xs text-destructive [overflow-wrap:anywhere]">{run.error}</p>
        ) : counts ? (
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{counts}</p>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function BackTo({ link, children }: { link: LinkOptions; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
      <Link {...link}>
        <ArrowLeft aria-hidden />
        {children}
      </Link>
    </Button>
  );
}

/** One provider's sync runs, newest first. */
function SyncRuns({ provider }: { provider: string }) {
  const runs = useInfiniteQuery({
    queryKey: ["get", "/system/meta/sync-runs", { provider }],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/system/meta/sync-runs", {
        params: { query: { provider, page_size: 25, ...(pageParam ? { page_token: pageParam } : {}) } },
      });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.runs.some((r) => r.status === "running")) ? POLL.listMs : false,
  });
  const list = runs.data?.pages.flatMap((page) => page.runs) ?? [];
  return (
    <>
      <BackTo link={providersLink}>Providers</BackTo>
      <PageHeader level={2} title={`${provider}: sync runs`} description="Newest first. Updates while one runs." />
      {runs.error ? <ErrorAlert error={runs.error} onRetry={() => void runs.refetch()} /> : null}
      {runs.isPending ? <Loading /> : null}
      {runs.data && list.length === 0 ? <EmptyState title="No sync runs yet" /> : null}
      {list.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((run) => (
            <li key={run.id}>
              <SyncRunRow run={run} />
            </li>
          ))}
        </ul>
      ) : null}
      {runs.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={runs.isFetchingNextPage} onClick={() => void runs.fetchNextPage()}>
            {runs.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Older runs
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** One sync run in full: what it did, from where to where, and what it noted. */
function SyncRunView({ provider, runId }: { provider: string; runId: string }) {
  const run = useQuery({
    ...$api.queryOptions("get", "/system/meta/sync-runs/{sync_run_id}", {
      params: { path: { sync_run_id: runId } },
    }),
    refetchInterval: (query) => (query.state.data?.status === "running" ? POLL.runMs : false),
  });
  const data = run.data;
  const facts: Array<[string, string | undefined]> = data
    ? [
        ["Received", data.upserts.toLocaleString()],
        ["Changed", data.changed.toLocaleString()],
        ["Removed", data.removals.toLocaleString()],
        ["Merged", data.merges.toLocaleString()],
        ["Skipped", data.skipped.toLocaleString()],
        ["Marked removed", data.marked_removed.toLocaleString()],
        ["Snapshot", data.snapshot_id],
        ["From", data.cursor_start],
        ["To", data.cursor_end],
      ]
    : [];
  const progress = Object.entries(data?.progress ?? {});
  return (
    <>
      <BackTo link={providerLink(provider)}>{provider}: sync runs</BackTo>
      {run.error ? <ErrorAlert error={run.error} onRetry={() => void run.refetch()} /> : null}
      {run.isPending ? <Loading /> : null}
      {data ? (
        <>
          <PageHeader
            level={2}
            title={
              <span className="flex flex-wrap items-center gap-3">
                {kindLabel(data.kind)} of {data.provider} <RunStatusBadge status={data.status} className="text-sm" />
              </span>
            }
            description={
              data.started_at
                ? `Started ${formatDateTime(data.started_at)} ${triggerText(data.trigger, OWNER)} · ${duration(
                    data.started_at,
                    data.finished_at,
                  )}`
                : undefined
            }
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card className="self-start">
              <CardHeader>
                <CardTitle as="h3">Outcome</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {data.error ? <p className="text-destructive [overflow-wrap:anywhere]">{data.error}</p> : null}
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                  {facts.map(([label, value]) =>
                    value !== undefined ? (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="tabular-nums [overflow-wrap:anywhere]">{value}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
                {progress.length > 0 ? (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-muted-foreground">Progress</h4>
                    <p className="text-xs tabular-nums [overflow-wrap:anywhere]">
                      {progress.map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ")}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h3">Notices</CardTitle>
              </CardHeader>
              <CardContent>
                {data.notices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing notable.</p>
                ) : (
                  <ol className="grid gap-2">
                    {data.notices.map((notice, i) => (
                      <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                        <Badge
                          variant="outline"
                          className={cn(
                            "self-start",
                            notice.level === "error" && "border-destructive/50 text-destructive",
                            notice.level === "warn" && "border-warning/50 text-warning",
                          )}
                        >
                          {notice.level}
                        </Badge>
                        <span className="[overflow-wrap:anywhere]">{notice.message}</span>
                        {notice.at || notice.ref ? (
                          <span className="col-start-2 text-xs text-muted-foreground">
                            {[notice.at ? formatDateTime(notice.at) : undefined, notice.ref]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
