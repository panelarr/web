// SPDX-License-Identifier: GPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Loader2, Stethoscope } from "lucide-react";
import { useContext, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { SearchInput } from "@/components/search-input";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VirtualList } from "@/components/virtual-list";
import { HealthBadge } from "@/features/admin/health-badge";
import { type Job, perSourceJobs, SOURCE_IDS_PARAM } from "@/features/jobs/jobs";
import { JobsContext, type JobsHost, useJobList, useJobsHost, useRun } from "@/features/jobs/use-jobs";
import { formatDateTime, formatRelative } from "@/lib/format";

type Source = components["schemas"]["SourceInfo"];
type SourceList = components["schemas"]["SourceList"];

export interface SourcesHealthSearch {
  q?: string;
  /** Only failing sources, or only those with scheduled checks off. */
  health?: "failing" | "off";
  /** Also the sources that aren't there now (language off, or gone from the plugin). */
  hidden?: true;
}

export function sourcesHealthSearch(search: Record<string, unknown>): SourcesHealthSearch {
  const out: SourcesHealthSearch = {};
  if (typeof search.q === "string" && search.q) out.q = search.q;
  if (search.health === "failing" || search.health === "off") out.health = search.health;
  if (search.hidden === true || search.hidden === "true") out.hidden = true;
  return out;
}

const sourcesOptions = (pluginId: string) =>
  $api.queryOptions("get", "/sources", { params: { query: { all: true, plugin_id: pluginId } } });

/**
 * A plugin's sources and their health checks (plugins with `health_checks`): how each fared
 * last, its scheduled checks on or off, and Check now through the plugin's per-source job
 * (one taking `source_ids`), when it has one.
 */
export function SourcesHealthPanel({
  pluginId,
  jobs,
  search,
  onSearch,
}: {
  pluginId: string;
  /** The plugin's jobs, when it has the `jobs` capability. */
  jobs: JobsHost | undefined;
  search: SourcesHealthSearch;
  onSearch: (change: Partial<SourcesHealthSearch>) => void;
}) {
  const list = useQuery(sourcesOptions(pluginId));
  const everything = list.data?.sources ?? [];
  // As in Admin → Sources: sources that aren't there now (a language turned off, gone from the
  // plugin) are kept for their works' history, but hidden unless asked for.
  const hidden = everything.filter((s) => !s.present).length;
  const all = useMemo(
    () => (search.hidden ? everything : everything.filter((s) => s.present)),
    [everything, search.hidden],
  );
  const failing = all.filter((s) => s.health.status === "failing").length;
  const off = all.filter((s) => s.health.checks_disabled).length;
  const shown = useMemo(() => {
    const q = search.q?.trim().toLowerCase();
    return all
      .filter(
        (s) =>
          (!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) &&
          (search.health !== "failing" || s.health.status === "failing") &&
          (search.health !== "off" || s.health.checks_disabled),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang));
  }, [all, search.q, search.health]);

  const body = (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SearchInput
          placeholder="Search sources"
          aria-label="Search sources"
          value={search.q ?? ""}
          onChange={(q) => onSearch({ q: q || undefined })}
        />
        <NativeSelect
          aria-label="Health"
          value={search.health ?? ""}
          onChange={(e) => onSearch({ health: (e.target.value || undefined) as SourcesHealthSearch["health"] })}
        >
          <option value="">Every source</option>
          <option value="failing">Failing ({failing})</option>
          <option value="off">Checks off ({off})</option>
        </NativeSelect>
      </div>
      {list.data ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-muted-foreground">
            {shown.length === all.length
              ? `${all.length} ${all.length === 1 ? "source" : "sources"}`
              : `${shown.length} of ${all.length} sources`}
            {failing ? ` · ${failing} failing` : ""}
            {off ? ` · ${off} with scheduled checks off` : ""}
          </p>
          {hidden > 0 ? (
            <Button variant="outline" size="sm" onClick={() => onSearch({ hidden: search.hidden ? undefined : true })}>
              {search.hidden ? "Hide" : "Show"} hidden ({hidden})
            </Button>
          ) : null}
        </div>
      ) : null}
      {list.error ? <ErrorAlert error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Loading /> : null}
      {list.data && shown.length === 0 ? (
        <EmptyState icon={<Stethoscope />} title={all.length === 0 ? "No sources" : "No source matches"}>
          {hidden > 0 && !search.hidden ? `${hidden} hidden: they aren't there now.` : null}
        </EmptyState>
      ) : null}
      {shown.length > 0 ? (
        <VirtualList
          label="Sources"
          items={shown}
          getKey={(s) => s.id}
          estimateSize={112}
          className="overflow-hidden rounded-xl border bg-card"
          renderItem={(source, index) => <SourceRow source={source} first={index === 0} pluginId={pluginId} />}
        />
      ) : null}
    </div>
  );
  return jobs ? <JobsContext value={jobs}>{body}</JobsContext> : body;
}

function SourceRow({ source, first, pluginId }: { source: Source; first: boolean; pluginId: string }) {
  const { health } = source;
  return (
    <div className={first ? "flex flex-wrap items-start gap-3 p-4" : "flex flex-wrap items-start gap-3 border-t p-4"}>
      <SourceIcon name={source.name} url={source.icon_url} className="mt-0.5" />
      <div className="min-w-0 flex-1 basis-48 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/sources/$sourceId"
            params={{ sourceId: source.id }}
            className="font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
          >
            {source.name}
          </Link>
          <Badge variant="outline" className="uppercase">
            {source.lang}
          </Badge>
          {source.present ? null : <Badge variant="secondary">Not present</Badge>}
          {source.enabled ? null : <Badge variant="secondary">Off</Badge>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <HealthBadge status={health.status} />
          {health.checked_at ? (
            <time dateTime={health.checked_at} title={formatDateTime(health.checked_at)}>
              checked {formatRelative(health.checked_at)}
            </time>
          ) : (
            <span>never checked</span>
          )}
        </p>
        {health.status === "failing" && (health.message || health.reason) ? (
          <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">
            {[health.message, health.reason ? `(${health.reason})` : undefined].filter(Boolean).join(" ")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ScheduledChecks source={source} pluginId={pluginId} />
        {source.present ? <CheckNow source={source} pluginId={pluginId} /> : null}
      </div>
    </div>
  );
}

/** Puts a changed source into the plugin's cached list. */
function usePatchSource(pluginId: string) {
  const queryClient = useQueryClient();
  return (source: Source) =>
    queryClient.setQueryData<SourceList>(sourcesOptions(pluginId).queryKey, (old) =>
      old ? { ...old, sources: old.sources.map((s) => (s.id === source.id ? source : s)) } : old,
    );
}

function ScheduledChecks({ source, pluginId }: { source: Source; pluginId: string }) {
  const id = useId();
  const patch = usePatchSource(pluginId);
  const save = $api.useMutation("put", "/sources/{source_id}/health-check", {
    onSuccess: patch,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={!source.health.checks_disabled}
        disabled={save.isPending}
        aria-label={`Scheduled checks for ${source.name} (${source.lang})`}
        onCheckedChange={(enabled) => save.mutate({ params: { path: { source_id: source.id } }, body: { enabled } })}
      />
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground" aria-hidden>
        Scheduled checks
      </Label>
    </div>
  );
}

/** Check now: runs the plugin's per-source job for this source, and follows it to the end. */
function CheckNow({ source, pluginId }: { source: Source; pluginId: string }) {
  // Only plugins with jobs can check a source on request.
  return useContext(JobsContext) ? <CheckNowButton source={source} pluginId={pluginId} /> : null;
}

function CheckNowButton({ source, pluginId }: { source: Source; pluginId: string }) {
  const { service, links } = useJobsHost();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const jobs = useJobList();
  const choices = perSourceJobs(jobs.data?.jobs ?? []);
  const [checking, setChecking] = useState<{ job: Job; runId: string }>();
  const run = useRun(checking?.runId);
  const label = `${source.name} (${source.lang})`;
  const watch = (job: Job, runId: string) => ({
    label: "Watch",
    onClick: () => void navigate(links.run(job.id, runId)),
  });

  const start = useMutation({
    mutationFn: (job: Job) => service.start(job.id, { [SOURCE_IDS_PARAM]: source.id }),
    onSuccess: (started, job) => setChecking({ job, runId: started.id }),
    onError: (error, job) => {
      if (!isApiError(error, "already_running")) {
        toast.error(`${label}: ${errorMessage(error)}`);
        return;
      }
      const current = error.problem?.current_run ?? error.problem?.current_run_id;
      toast.info(`${job.name} is already running.`, current ? { action: watch(job, current) } : {});
    },
  });

  // When the run ends: the source's new health, and how it went.
  const status = run.data?.summary.status;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per run, when it ends
  useEffect(() => {
    if (!checking || !status || status === "running") return;
    void queryClient.invalidateQueries({ queryKey: sourcesOptions(pluginId).queryKey });
    const message = run.data?.summary.message;
    if (status === "succeeded") toast.success(`Checked ${label}.`);
    else
      toast.error(`${label}: ${message || "the check didn't finish"}.`, {
        action: watch(checking.job, checking.runId),
      });
    setChecking(undefined);
  }, [status, checking?.runId]);

  if (choices.length === 0) return null;
  if (checking || start.isPending) {
    return (
      <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking…
        {checking ? (
          <Link {...links.run(checking.job.id, checking.runId)} className="underline underline-offset-4">
            Watch
          </Link>
        ) : null}
      </span>
    );
  }
  if (choices.length === 1) {
    const [job] = choices as [Job];
    return (
      <Button size="sm" variant="outline" aria-label={`Check ${label} now`} onClick={() => start.mutate(job)}>
        <Stethoscope aria-hidden />
        Check now
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Check ${label} now`}>
          <Stethoscope aria-hidden />
          Check now
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {choices.map((job) => (
          <DropdownMenuItem key={job.id} onSelect={() => start.mutate(job)}>
            {job.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
