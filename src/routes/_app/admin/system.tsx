// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { $api } from "@/api/client";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";
import { MetaConnectionPanel } from "@/features/setup/meta-connection";

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
        <Card>
          <CardHeader>
            <CardTitle>Metadata service</CardTitle>
            <CardDescription>Where Panelarr finds works. The library needs it.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetaConnectionPanel />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
