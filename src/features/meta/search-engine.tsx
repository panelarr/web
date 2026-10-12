// SPDX-License-Identifier: GPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, FlaskConical, Hammer, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { Field } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HealthBadge } from "@/features/admin/health-badge";
import { META_JOBS } from "@/features/jobs/hosts";
import { POLL } from "@/features/jobs/use-jobs";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Engine = components["schemas"]["MetaSearchEngine"];
type Settings = components["schemas"]["SearchEngineSettings"];
type Backend = Settings["backend"];
type Browse = NonNullable<Settings["browse"]>;

const BACKENDS: Record<Backend, string> = {
  postgres: "The database (built in)",
  typesense: "Typesense",
  meilisearch: "Meilisearch",
};
const BROWSE: Record<Browse, string> = {
  facets: "The engine, with filter counts",
  engine: "The engine",
  postgres: "The database",
};
const REBUILD_JOB = "search-rebuild";

const engineKey = () => $api.queryOptions("get", "/system/meta/search-engine").queryKey;

/** The metadata service's search: what answers now and how the index is doing; its settings; rebuild. */
export function SearchEnginePanel() {
  const engine = useQuery({
    ...$api.queryOptions("get", "/system/meta/search-engine"),
    // A backlog drains on its own: watch it go down while there is one.
    refetchInterval: (query) => ((query.state.data?.status.pending ?? 0) > 0 ? 15_000 : false),
  });
  return (
    <>
      {engine.error ? <ErrorAlert error={engine.error} onRetry={() => void engine.refetch()} /> : null}
      {engine.isPending ? <Loading /> : null}
      {engine.data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <StatusCard engine={engine.data} />
          {/* Keyed by what's saved, so the form starts over from it after a save or reset. */}
          <SettingsCard key={JSON.stringify(engine.data.settings)} engine={engine.data} />
        </div>
      ) : null}
    </>
  );
}

function Capability({ on, children }: { on: boolean; children: string }) {
  return (
    <li className={cn("flex items-center gap-1.5", !on && "text-muted-foreground")}>
      {on ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4" aria-hidden />}
      <span>
        {children}
        <span className="sr-only">{on ? ": yes" : ": no"}</span>
      </span>
    </li>
  );
}

function StatusCard({ engine }: { engine: Engine }) {
  const { status } = engine;
  const health = !status.reachable ? "down" : status.degraded || !status.ready ? "degraded" : "ok";
  const rows: Array<[string, string | undefined]> = [
    ["Index", status.index],
    ["Entries in it", status.documents.toLocaleString()],
    ["Built", status.built_at ? formatDateTime(status.built_at) : undefined],
    [
      "Waiting",
      status.pending > 0
        ? `${status.pending.toLocaleString()} changes${
            status.lag_seconds ? `, the oldest ${formatRelative(new Date(Date.now() - status.lag_seconds * 1000))}` : ""
          }`
        : "Nothing: up to date",
    ],
    ["Applied", status.applied.toLocaleString()],
  ];
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle as="h3" className="flex flex-wrap items-center gap-3">
          Search now <HealthBadge status={health} />
        </CardTitle>
        <CardDescription>
          {BACKENDS[status.backend as Backend] ?? status.backend} answers searches
          {status.ready ? "." : ", but its index isn't ready: the database answers meanwhile."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {status.degraded ? (
          <p className="text-warning">Recent searches failed, and the database answered them.</p>
        ) : null}
        {status.error ? (
          <p className="text-destructive [overflow-wrap:anywhere]">
            {status.error}
            {status.error_at ? ` (${formatRelative(status.error_at)})` : ""}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="What it can do">
          <Capability on={status.typo_tolerance}>Forgives typos</Capability>
          <Capability on={status.substring}>Finds parts of words</Capability>
          <Capability on={status.facets}>Counts for filters</Capability>
        </ul>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          {rows.map(([name, value]) =>
            value ? (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="tabular-nums [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
        {status.indexer_error ? (
          <p className="text-destructive [overflow-wrap:anywhere]">
            Indexing failed: {status.indexer_error}
            {status.indexer_error_at ? ` (${formatRelative(status.indexer_error_at)})` : ""}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <RebuildButton />
      </CardFooter>
    </Card>
  );
}

/** Rebuilds the index through the service's own job, and follows it on the Jobs tab. */
function RebuildButton() {
  const { service, links } = META_JOBS;
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: service.keys.job(REBUILD_JOB),
    queryFn: () => service.job(REBUILD_JOB),
    retry: false,
    refetchInterval: (query) => (query.state.data?.running ? POLL.listMs : false),
  });
  // When a rebuild ends, the index's figures change.
  const running = job.data?.running;
  const before = useRef(running);
  useEffect(() => {
    if (before.current && running === false) void queryClient.invalidateQueries({ queryKey: engineKey() });
    before.current = running;
  }, [running, queryClient]);
  const start = useMutation({
    mutationFn: () => service.start(REBUILD_JOB, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => service.keys.owns(q.queryKey) });
      toast.success("Rebuilding the search index.");
    },
    onError: (error) => {
      if (isApiError(error, "already_running")) {
        void job.refetch();
        toast.info("A rebuild is already running.");
      } else toast.error(`Not started: ${errorMessage(error)}`);
    },
  });
  // A service without the job has no rebuild to offer.
  if (job.error || !job.data) return null;
  if (job.data.running) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Rebuilding the index…
        {job.data.current_run_id ? (
          <Link {...links.run(REBUILD_JOB, job.data.current_run_id)} className="underline underline-offset-4">
            Watch
          </Link>
        ) : null}
      </p>
    );
  }
  return (
    <Button variant="outline" disabled={start.isPending} onClick={() => start.mutate()}>
      {start.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Hammer aria-hidden />}
      Rebuild the index
    </Button>
  );
}

function SettingsCard({ engine }: { engine: Engine }) {
  const queryClient = useQueryClient();
  const saved = engine.settings;
  const [form, setForm] = useState<Settings>({
    backend: (saved.backend as Backend) ?? "postgres",
    url: saved.url ?? "",
    api_key: "",
    index_prefix: saved.index_prefix ?? "",
    ...(saved.browse ? { browse: saved.browse as Browse } : {}),
  });
  const set = (change: Partial<Settings>) => setForm({ ...form, ...change });
  const external = form.backend !== "postgres";
  // An empty key keeps the stored one; empty texts are left out; the database needs no URL.
  const body = (): Settings => ({
    backend: form.backend,
    ...(external && form.url?.trim() ? { url: form.url.trim() } : {}),
    ...(external && form.api_key ? { api_key: form.api_key } : {}),
    ...(external && form.index_prefix?.trim() ? { index_prefix: form.index_prefix.trim() } : {}),
    ...(form.browse ? { browse: form.browse } : {}),
  });
  const stored = (next: Engine) => queryClient.setQueryData(engineKey(), next);
  const save = $api.useMutation("put", "/system/meta/search-engine", {
    onSuccess: (next) => {
      stored(next);
      toast.success("Search engine settings saved. Rebuild the index if the engine changed.");
    },
  });
  const test = $api.useMutation("post", "/system/meta/search-engine/test");
  const reset = $api.useMutation("post", "/system/meta/search-engine/reset", {
    onSuccess: (next) => {
      stored(next);
      toast.success("Back to the service's configuration.");
    },
  });
  return (
    <Card>
      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ body: body() });
        }}
      >
        <CardHeader>
          <CardTitle as="h3">Settings</CardTitle>
          <CardDescription>
            {saved.origin === "admin"
              ? "Set here, over the service's configuration."
              : "From the service's configuration. Saving here sets them over it until you reset."}{" "}
            The service talks to the engine; browsers never do.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {save.error ? <ErrorAlert error={save.error} title="Not saved" /> : null}
          <Field label="Engine">
            {(aria) => (
              <NativeSelect
                {...aria}
                value={form.backend}
                onChange={(e) => set({ backend: e.target.value as Backend })}
              >
                {(Object.keys(BACKENDS) as Backend[]).map((backend) => (
                  <option key={backend} value={backend}>
                    {BACKENDS[backend]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {external ? (
            <>
              <Field label="URL">
                {(aria) => (
                  <Input
                    {...aria}
                    type="url"
                    inputMode="url"
                    required
                    value={form.url ?? ""}
                    onChange={(e) => set({ url: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="API key"
                hint={saved.has_api_key ? "A key is saved: leave empty to keep it." : "If the engine needs one."}
              >
                {(aria) => (
                  <Input
                    {...aria}
                    type="password"
                    autoComplete="off"
                    value={form.api_key ?? ""}
                    onChange={(e) => set({ api_key: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Index prefix" hint="Before the index's name, to share one engine.">
                {(aria) => (
                  <Input
                    {...aria}
                    value={form.index_prefix ?? ""}
                    onChange={(e) => set({ index_prefix: e.target.value })}
                  />
                )}
              </Field>
            </>
          ) : null}
          <Field label="Browsing without search text" hint="Who lists the catalogue when nothing is typed.">
            {(aria) => (
              <NativeSelect
                {...aria}
                value={form.browse ?? ""}
                onChange={(e) => set({ browse: (e.target.value || undefined) as Browse | undefined })}
              >
                <option value="">The service's default</option>
                {(Object.keys(BROWSE) as Browse[]).map((browse) => (
                  <option key={browse} value={browse}>
                    {BROWSE[browse]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {test.error ? <ErrorAlert error={test.error} title="The test didn't run" /> : null}
          {test.data ? (
            <p role="status" className={test.data.ok ? "text-sm text-success" : "text-sm text-destructive"}>
              {test.data.ok
                ? "The service can use these settings."
                : `It can't: ${test.data.error ?? "no reason given"}`}
            </p>
          ) : null}
          {reset.error ? <ErrorAlert error={reset.error} title="Not reset" /> : null}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-2">
          {saved.origin === "admin" ? (
            <Button type="button" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate({})}>
              <RotateCcw aria-hidden />
              Use the configuration
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => test.mutate({ body: body() })}
            >
              {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
              Test
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
