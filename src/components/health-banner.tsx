// SPDX-License-Identifier: GPL-3.0-or-later

import { TriangleAlert } from "lucide-react";
import { $api } from "@/api/client";
import { cn } from "@/lib/utils";

/**
 * For admins: says when the server is degraded (an optional part fails, e.g. the metadata
 * service has no entries yet) or unavailable (a required part fails).
 */
export function HealthBanner() {
  const health = $api.useQuery("get", "/system/health", {}, { refetchInterval: 60_000 });
  const data = health.data;
  if (!data || data.status === "ok") return null;
  const failing = data.components.filter((c) => c.status === "failing");
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        data.status === "unavailable" ? "border-destructive/50 bg-destructive/10" : "border-warning/50 bg-warning/10",
      )}
    >
      <TriangleAlert
        className={cn("mt-0.5 size-4 shrink-0", data.status === "unavailable" ? "text-destructive" : "text-warning")}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="font-medium">
          {data.status === "unavailable" ? "Panelarr is unavailable" : "Panelarr is running degraded"}
        </p>
        <ul className="mt-1 text-muted-foreground">
          {failing.map((c) => (
            <li key={c.name} className="[overflow-wrap:anywhere]">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.error ? `: ${c.error}` : " is failing"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
