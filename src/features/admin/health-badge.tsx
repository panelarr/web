// SPDX-License-Identifier: GPL-3.0-or-later

import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  ok: "bg-success",
  degraded: "bg-warning",
  failing: "bg-destructive",
  down: "bg-destructive",
  unavailable: "bg-destructive",
  off: "bg-muted-foreground/50",
  unknown: "bg-muted-foreground/50",
};

const LABELS: Record<string, string> = {
  ok: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
  down: "Down",
  unavailable: "Unavailable",
  off: "Off",
  unknown: "Not checked",
};

/** A coloured dot and a word for a health status, readable without the colour. */
export function HealthBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", className)}>
      <span aria-hidden className={cn("size-2 rounded-full", TONES[status] ?? TONES.unknown)} />
      {LABELS[status] ?? status}
    </span>
  );
}
