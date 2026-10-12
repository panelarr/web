// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { $api } from "@/api/client";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";

export const Route = createFileRoute("/_app/admin/system")({
  component: SystemPage,
});

function SystemPage() {
  const health = $api.useQuery("get", "/system/health", {}, { refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="System" description={health.data ? `Panelarr server ${health.data.version}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Health</CardTitle>
            <CardDescription>What the server depends on. Optional parts can fail without stopping it.</CardDescription>
          </CardHeader>
          <CardContent>
            {health.error ? <ErrorAlert error={health.error} onRetry={() => void health.refetch()} /> : null}
            {health.isPending ? <Loading /> : null}
            {health.data ? (
              <ul className="divide-y rounded-lg border">
                {health.data.components.map((component) => (
                  <li key={component.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 font-medium">{component.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {component.required ? "required" : "optional"}
                    </span>
                    {component.latency_ms !== undefined ? (
                      <span className="text-xs text-muted-foreground tabular-nums">{component.latency_ms} ms</span>
                    ) : null}
                    <HealthBadge status={component.status} />
                    {component.error ? (
                      <p className="basis-full text-xs text-destructive [overflow-wrap:anywhere]">{component.error}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <MetaSummary />
      </div>
    </>
  );
}

/** The metadata service in a line; everything about it is on its own page. */
function MetaSummary() {
  const meta = $api.useQuery("get", "/system/meta");
  const check = meta.data?.check;
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Metadata service</CardTitle>
        <CardDescription>Where Panelarr finds works. The library needs it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {meta.error ? <ErrorAlert error={meta.error} onRetry={() => void meta.refetch()} /> : null}
        {check ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <HealthBadge
              status={!check.configured ? "unknown" : check.ready ? "ok" : check.reachable ? "degraded" : "failing"}
            />
            <span className="[overflow-wrap:anywhere]">
              {check.ready ? (meta.data?.url ?? "Connected") : (check.problem ?? "Not connected")}
            </span>
          </p>
        ) : null}
        <Button variant="outline" asChild className="justify-self-start">
          <Link to="/admin/metadata">
            Providers, jobs and settings
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
