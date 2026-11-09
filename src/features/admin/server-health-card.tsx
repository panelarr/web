// SPDX-License-Identifier: GPL-3.0-or-later

import { $api } from "@/api/client";
import { ErrorAlert, Loading } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";

/** The server's own components (its database, the metadata connection, …), checked every 30 s. */
export function ServerHealthCard() {
  const health = $api.useQuery("get", "/system/health", {}, { refetchInterval: 30_000 });
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Server</CardTitle>
        <CardDescription>What the server depends on. Optional parts can fail without stopping it.</CardDescription>
      </CardHeader>
      <CardContent>
        {health.error ? <ErrorAlert error={health.error} onRetry={() => void health.refetch()} /> : null}
        {health.isPending ? <Loading /> : null}
        {health.data ? (
          <ul className="divide-y rounded-lg border" aria-label="Server components">
            {health.data.components.map((component) => (
              <li key={component.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium">{component.name}</span>
                <span className="text-xs text-muted-foreground">{component.required ? "required" : "optional"}</span>
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
  );
}
