// SPDX-License-Identifier: GPL-3.0-or-later

import { Loader2 } from "lucide-react";
import type { components } from "@/api/schema.gen";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { RUN_STATUS, type RunStatus } from "./jobs";

const TONES = {
  good: "border-success/40 text-success",
  bad: "border-destructive/40 text-destructive",
  warn: "border-warning/50 text-warning",
  info: "border-info/40 text-info",
  neutral: "border-border text-muted-foreground",
} as const;

export function RunStatusBadge({ status, className }: { status: RunStatus | string; className?: string }) {
  const known = RUN_STATUS[status as RunStatus] ?? { label: status, tone: "neutral" as const };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[known.tone],
        className,
      )}
    >
      {status === "running" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
      {known.label}
    </span>
  );
}

/** A progress bar with "7 of 22 pages"; indeterminate when the total isn't known. */
export function ProgressLine({ progress }: { progress: components["schemas"]["JobProgress"] }) {
  const pct = progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : undefined;
  return (
    <div className="grid gap-1">
      <Progress value={pct ?? null} aria-label="Progress" className={pct === undefined ? "animate-pulse" : undefined} />
      <p className="text-xs text-muted-foreground tabular-nums">
        {[
          progress.phase,
          progress.total ? `${progress.done} of ${progress.total}` : String(progress.done),
          progress.unit,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}
