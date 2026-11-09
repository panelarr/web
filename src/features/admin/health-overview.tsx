// SPDX-License-Identifier: GPL-3.0-or-later

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Puzzle, RefreshCw } from "lucide-react";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";
import { ServerHealthCard } from "@/features/admin/server-health-card";
import { MetaHealthCard } from "@/features/meta/meta-health";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatVersion } from "@/lib/version";

type Plugin = components["schemas"]["Plugin"];

/** Every answer on the page is checked again this often, each on its own. */
export const HEALTH_POLL_MS = 30_000;

/** The queries this page shows, by path: Check now asks all of them again. */
const PATHS = new Set(["/system/health", "/system/meta", "/system/meta/health", "/plugins", "/sources"]);
const onThisPage = (query: { queryKey: readonly unknown[] }) => PATHS.has(query.queryKey[1] as string);

/**
 * Admin → Health: everything Panelarr depends on in one place: the server's components, the
 * metadata service, each source plugin, and the sources whose health checks fail. Each part
 * asks on its own and fails on its own, so one service being down never hides the others.
 */
export function HealthOverview() {
  const queryClient = useQueryClient();
  const server = $api.useQuery("get", "/system/health", {}, { refetchInterval: HEALTH_POLL_MS });
  const checking = useIsFetching({ predicate: onThisPage }) > 0;
  return (
    <>
      <PageHeader
        title="Health"
        description={
          server.data ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <HealthBadge status={server.data.status} className="text-sm" />
              <span>Panelarr server {formatVersion(server.data.version)}</span>
            </span>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            disabled={checking}
            onClick={() => void queryClient.refetchQueries({ predicate: onThisPage })}
          >
            <RefreshCw className={cn(checking && "animate-spin")} aria-hidden />
            Check now
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ServerHealthCard />
        <MetaHealthSection />
        <PluginsHealthCard />
        <SourceChecksCard />
      </div>
    </>
  );
}

/**
 * The metadata service's own health, or one line when it isn't connected or doesn't answer:
 * the page is about everything, so that's a finding, not an error for the whole page.
 */
function MetaHealthSection() {
  const meta = $api.useQuery("get", "/system/meta", {}, { refetchInterval: HEALTH_POLL_MS });
  const health = $api.useQuery("get", "/system/meta/health", {}, { refetchInterval: HEALTH_POLL_MS });
  const configured = meta.data?.check.configured;
  if (health.data && !health.error) return <MetaHealthCard title="Metadata service" />;
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Metadata service</CardTitle>
        <CardDescription>Where Panelarr finds works. The library needs it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {health.isPending ? (
          <Loading />
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <HealthBadge status={configured === false ? "unknown" : "down"} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {configured === false ? "Not connected yet." : errorMessage(health.error)}
            </span>
          </p>
        )}
        <Button variant="outline" asChild className="justify-self-start">
          <Link to="/admin/metadata">
            {configured === false ? "Connect it" : "Its connection and settings"}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Each source plugin's own health, as the server last saw it. A plugin that's off isn't down. */
function PluginsHealthCard() {
  const plugins = $api.useQuery("get", "/plugins", {}, { refetchInterval: HEALTH_POLL_MS });
  const list = plugins.data?.plugins ?? [];
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Source plugins</CardTitle>
        <CardDescription>The services that bring chapters from sources.</CardDescription>
      </CardHeader>
      <CardContent>
        {plugins.error ? <ErrorAlert error={plugins.error} onRetry={() => void plugins.refetch()} /> : null}
        {plugins.isPending ? <Loading /> : null}
        {plugins.data && list.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Puzzle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Plugins are optional: the library and the catalogue work without them. Add one in{" "}
              <Link to="/admin/plugins" className="text-foreground underline underline-offset-4">
                Plugins
              </Link>{" "}
              to read and download chapters.
            </span>
          </p>
        ) : null}
        {list.length > 0 ? (
          <ul className="divide-y rounded-lg border" aria-label="Source plugins">
            {list.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PluginRow({ plugin }: { plugin: Plugin }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <Link
        to="/admin/plugins/$pluginId"
        params={{ pluginId: plugin.id }}
        className="min-w-0 flex-1 font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
      >
        {plugin.name}
      </Link>
      <span className="text-xs text-muted-foreground">{formatVersion(plugin.version)}</span>
      {plugin.enabled && plugin.checked_at ? (
        <span className="text-xs text-muted-foreground">checked {formatRelative(plugin.checked_at)}</span>
      ) : null}
      <HealthBadge status={plugin.enabled ? plugin.health : "off"} />
      {!plugin.enabled ? (
        <p className="basis-full text-xs text-muted-foreground">
          Turned off: not checked, and its sources aren't used.
        </p>
      ) : plugin.health_message ? (
        <p
          className={cn(
            "basis-full text-xs [overflow-wrap:anywhere]",
            plugin.health === "down"
              ? "text-destructive"
              : plugin.health === "degraded"
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          {plugin.health_message}
        </p>
      ) : null}
    </li>
  );
}

/**
 * For each plugin that checks its sources' health: how many fail and how many have their
 * scheduled checks off, linked to that plugin's Sources tab filtered to them. Counts cover the
 * sources that are there now, as that tab does by default.
 */
function SourceChecksCard() {
  const plugins = $api.useQuery("get", "/plugins", {}, { refetchInterval: HEALTH_POLL_MS });
  const checking = (plugins.data?.plugins ?? []).filter((p) => p.enabled && p.capabilities.includes("health_checks"));
  const sources = $api.useQuery(
    "get",
    "/sources",
    { params: { query: { all: true } } },
    { refetchInterval: HEALTH_POLL_MS, enabled: checking.length > 0 },
  );
  if (checking.length === 0) return null;
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Source checks</CardTitle>
        <CardDescription>Sources whose last health check failed, and those not checked on a schedule.</CardDescription>
      </CardHeader>
      <CardContent>
        {sources.error ? <ErrorAlert error={sources.error} onRetry={() => void sources.refetch()} /> : null}
        {sources.isPending ? <Loading /> : null}
        {sources.data ? (
          <ul className="divide-y rounded-lg border" aria-label="Source checks">
            {checking.map((plugin) => {
              const own = sources.data.sources.filter((s) => s.plugin_id === plugin.id && s.present);
              const failing = own.filter((s) => s.health.status === "failing").length;
              const off = own.filter((s) => s.health.checks_disabled).length;
              return (
                <li key={plugin.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{plugin.name}</span>
                  {failing === 0 && off === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {own.length === 0 ? "No sources" : "None failing"}
                    </span>
                  ) : null}
                  {failing > 0 ? (
                    <Link
                      to="/admin/plugins/$pluginId"
                      params={{ pluginId: plugin.id }}
                      search={{ tab: "sources", health: "failing" }}
                      className="text-destructive underline-offset-4 hover:underline"
                    >
                      {failing} failing
                    </Link>
                  ) : null}
                  {off > 0 ? (
                    <Link
                      to="/admin/plugins/$pluginId"
                      params={{ pluginId: plugin.id }}
                      search={{ tab: "sources", health: "off" }}
                      className="text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {off} with checks off
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
