// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Library, X } from "lucide-react";
import { useMemo } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { HealthBadge } from "@/features/admin/health-badge";

type Source = components["schemas"]["SourceInfo"];

const STATUSES = ["ok", "failing", "unknown", "off", "unavailable", "gone"] as const;
type StatusFilter = (typeof STATUSES)[number];

interface SourcesSearch {
  q?: string;
  plugin?: string;
  /** Also the sources that don't exist for anyone now: Not available and Absent. */
  hidden?: true;
  /** Only one package's (extension's) sources, e.g. from the plugin's Extensions tab. */
  package?: string;
  lang?: string;
  status?: StatusFilter;
}

export const Route = createFileRoute("/_app/admin/sources/")({
  validateSearch: (search: Record<string, unknown>): SourcesSearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.plugin === "string" && search.plugin ? { plugin: search.plugin } : {}),
    ...(typeof search.package === "string" && search.package ? { package: search.package } : {}),
    ...(search.hidden === true || search.hidden === "true" ? { hidden: true as const } : {}),
    ...(typeof search.lang === "string" && search.lang ? { lang: search.lang } : {}),
    ...(STATUSES.includes(search.status as StatusFilter) ? { status: search.status as StatusFilter } : {}),
  }),
  component: SourcesPage,
});

function matches(source: Source, search: SourcesSearch): boolean {
  if (search.plugin && source.plugin_id !== search.plugin) return false;
  if (search.package && source.package_id !== search.package) return false;
  if (search.lang && source.lang !== search.lang) return false;
  if (search.q && !`${source.name} ${source.id}`.toLowerCase().includes(search.q.toLowerCase())) return false;
  switch (search.status) {
    case "off":
      return !source.enabled;
    case "unavailable":
      return !source.present && source.unavailable_reason === "language";
    case "gone":
      return !source.present && !source.unavailable_reason;
    case undefined:
      return true;
    default:
      return source.health.status === search.status;
  }
}

function SourcesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sources = $api.useQuery("get", "/sources", { params: { query: { all: true } } });
  const all = sources.data?.sources ?? [];
  const pluginList = $api.useQuery("get", "/plugins");
  const plugins = useMemo(() => [...new Set(all.map((s) => s.plugin_id))].sort(), [all]);
  const pluginName = (id: string) => pluginList.data?.plugins.find((p) => p.id === id)?.name ?? id;
  const langs = useMemo(() => [...new Set(all.map((s) => s.lang))].sort(), [all]);
  // Sources that don't exist for anyone now (their language is off, or their plugin no longer
  // lists them) are kept for their works' history but hidden unless asked for, so a language
  // turned off doesn't look like a setting that didn't work.
  const showHidden = search.hidden === true || search.status === "unavailable" || search.status === "gone";
  const existing = all.filter((source) => source.present);
  const hidden = all.length - existing.length;
  const shown = (showHidden ? all : existing).filter((source) => matches(source, search));
  const failing = existing.filter((s) => s.health.status === "failing").length;

  const set = (change: Partial<SourcesSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });

  return (
    <>
      <PageHeader
        title="Sources"
        description={
          sources.data
            ? `${existing.length} sources${failing ? ` · ${failing} failing` : ""}${hidden ? ` · ${hidden} hidden` : ""}. Turning one off hides it from everyone.`
            : undefined
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Input
          type="search"
          placeholder="Search sources"
          aria-label="Search sources"
          value={search.q ?? ""}
          onChange={(e) => set({ q: e.target.value || undefined })}
        />
        <NativeSelect
          aria-label="Plugin"
          value={search.plugin ?? ""}
          onChange={(e) => set({ plugin: e.target.value || undefined })}
        >
          <option value="">All plugins</option>
          {plugins.map((plugin) => (
            <option key={plugin} value={plugin}>
              {pluginName(plugin)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Language"
          value={search.lang ?? ""}
          onChange={(e) => set({ lang: e.target.value || undefined })}
        >
          <option value="">All languages</option>
          {langs.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Status"
          value={search.status ?? ""}
          onChange={(e) => set({ status: (e.target.value || undefined) as StatusFilter | undefined })}
        >
          <option value="">Any status</option>
          <option value="ok">Healthy</option>
          <option value="failing">Failing</option>
          <option value="unknown">Not checked</option>
          <option value="off">Off</option>
          <option value="unavailable">Not available (language off)</option>
          <option value="gone">Absent (no longer listed)</option>
        </NativeSelect>
      </div>
      {hidden > 0 && search.status !== "unavailable" && search.status !== "gone" ? (
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={() => set({ hidden: search.hidden ? undefined : true })}>
            {search.hidden ? "Hide" : "Show"} hidden ({hidden})
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">
            Not available (language off) or no longer listed by their plugin.
          </span>
        </div>
      ) : null}
      {search.package ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          Extension:
          <Badge variant="secondary" className="gap-1">
            {all.find((source) => source.package_id === search.package)?.package_name ?? search.package}
            <button
              type="button"
              aria-label="Show every extension's sources"
              className="-mr-1 rounded-full p-0.5 hover:bg-background/60"
              onClick={() => set({ package: undefined })}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        </p>
      ) : null}
      {sources.error ? <ErrorAlert error={sources.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.isPending ? <Loading /> : null}
      {sources.data && shown.length === 0 ? (
        <EmptyState icon={<Library />} title={all.length === 0 ? "No sources yet" : "No source matches"}>
          {all.length === 0
            ? "Sources come from plugins. Add one under Plugins."
            : `Try other filters${hidden && !showHidden ? `, or show the ${hidden} hidden` : ""}.`}
        </EmptyState>
      ) : null}
      {shown.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((source) => (
            <SourceRow key={source.id} source={source} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function SourceRow({ source }: { source: Source }) {
  const queryClient = useQueryClient();
  const update = $api.useMutation("patch", "/sources/{source_id}", {
    onSuccess: () => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "/sources" }),
  });
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <SourceIcon name={source.name} url={source.icon_url} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* The source's own lists, for testing it. */}
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
          {source.content_rating === "nsfw" || source.content_rating === "mixed" ? (
            <Badge variant="secondary">{source.content_rating}</Badge>
          ) : null}
          {/* Off is the admin's switch; Not available, its language is turned off; Absent, its
              plugin no longer lists it. */}
          {source.enabled ? null : <Badge variant="secondary">Off</Badge>}
          {source.present ? null : source.unavailable_reason === "language" ? (
            <Badge variant="outline">Not available</Badge>
          ) : (
            <Badge variant="destructive">Absent</Badge>
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <HealthBadge status={source.health.status} />
          <span className="[overflow-wrap:anywhere]">{source.id}</span>
          {source.package_name ? <span className="[overflow-wrap:anywhere]">via {source.package_name}</span> : null}
          {source.present ? null : (
            <span className="basis-full [overflow-wrap:anywhere]">
              {source.unavailable_reason === "language"
                ? "Its language is turned off for its plugin or extension."
                : "No longer listed by its plugin."}{" "}
              Works keep its chapters; copies come from other sources.
            </span>
          )}
          {source.health.status === "failing" && (source.health.message || source.health.reason) ? (
            <span className="basis-full text-destructive [overflow-wrap:anywhere]">
              {source.health.message ?? source.health.reason}
            </span>
          ) : null}
        </p>
        {update.error ? <ErrorAlert error={update.error} /> : null}
      </div>
      <Switch
        aria-label={`${source.name} on`}
        checked={source.enabled}
        disabled={update.isPending}
        onCheckedChange={(enabled) => update.mutate({ params: { path: { source_id: source.id } }, body: { enabled } })}
      />
    </li>
  );
}
