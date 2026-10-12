// SPDX-License-Identifier: GPL-3.0-or-later

import { $api } from "@/api/client";
import { ErrorAlert, Loading } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";
import { cn } from "@/lib/utils";

/** "provider:example-provider" → "Provider example-provider"; "search" → "Search". */
export function componentName(name: string): string {
  const [first = "", ...rest] = name.split(":");
  const words = [first.charAt(0).toUpperCase() + first.slice(1), ...rest];
  return words.join(" ");
}

/** The metadata service's own health: its database, its search backend and each provider's plugin. */
export function MetaHealthCard() {
  const health = $api.useQuery("get", "/system/meta/health", {}, { refetchInterval: 30_000 });
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          Health {health.data ? <HealthBadge status={health.data.status} /> : null}
        </CardTitle>
        <CardDescription>
          {health.data?.version ? `Metadata service ${health.data.version}. ` : ""}What it depends on, as it sees it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health.error ? <ErrorAlert error={health.error} onRetry={() => void health.refetch()} /> : null}
        {health.isPending ? <Loading /> : null}
        {health.data ? (
          <ul className="divide-y rounded-lg border">
            {health.data.components.map((component) => {
              const details = Object.entries(component.details);
              return (
                <li key={component.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                    {componentName(component.name)}
                  </span>
                  {component.latency_ms !== undefined ? (
                    <span className="text-xs text-muted-foreground tabular-nums">{component.latency_ms} ms</span>
                  ) : null}
                  <HealthBadge status={component.status} />
                  {component.message ? (
                    <p
                      className={cn(
                        "basis-full text-xs [overflow-wrap:anywhere]",
                        component.status === "down"
                          ? "text-destructive"
                          : component.status === "degraded"
                            ? "text-warning"
                            : "text-muted-foreground",
                      )}
                    >
                      {component.message}
                    </p>
                  ) : null}
                  {details.length > 0 ? (
                    <p className="basis-full text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {details.map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join(" · ")}
                    </p>
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
