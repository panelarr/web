// SPDX-License-Identifier: GPL-3.0-or-later

import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";

export type Import = components["schemas"]["Import"];
export type ImportItem = components["schemas"]["ImportItem"];
export type ImportOutcome = components["schemas"]["ImportOutcome"];
export type ImportState = components["schemas"]["ImportState"];
export type ImportResult = components["schemas"]["ImportResult"];

/** The largest backup the server takes (`POST /me/imports`). */
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

/** The preview's tabs, in the order a user goes through them (`pending` has none). */
export const OUTCOMES: ReadonlyArray<{ id: Exclude<ImportOutcome, "pending">; label: string; hint: string }> = [
  {
    id: "ready",
    label: "Ready",
    hint: "These go into your library, with the backup's source where Panelarr has it.",
  },
  {
    id: "in_library",
    label: "Already in library",
    hint: "Already in your library: only their read chapters and bookmarks come along.",
  },
  {
    id: "needs_choice",
    label: "Needs a choice",
    hint: "Several catalogue entries could be these: choose the right one for each, or skip it.",
  },
  {
    id: "not_found",
    label: "Not found",
    hint: "The catalogue has nothing that matches these: search it for the right work, or skip them.",
  },
  {
    id: "source_missing",
    label: "Source missing",
    hint: "These are imported through the catalogue, without the backup's source: Panelarr doesn't have it.",
  },
  {
    id: "not_allowed",
    label: "Not allowed",
    hint: "Your account may not add these, or may not use their source.",
  },
];
export type OutcomeTab = (typeof OUTCOMES)[number]["id"];

export function isOutcomeTab(value: unknown): value is OutcomeTab {
  return OUTCOMES.some((o) => o.id === value);
}

export const STATE_LABELS: Record<ImportState, string> = {
  previewing: "Matching series",
  preview: "Ready to review",
  applying: "Importing",
  done: "Imported",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** An import that's still working (another one can't start meanwhile). */
export function isRunning(state: ImportState): boolean {
  return state === "previewing" || state === "applying";
}

/** What apply did with a series, as a short label. */
export const RESULT_LABELS: Record<ImportResult, string> = {
  applied: "Imported",
  already_imported: "Already imported",
  skipped: "Skipped",
};

/**
 * Whether the import can be applied from here: once its preview finished, and not while it
 * runs or after it's done. A cancelled or failed apply resumes. The server decides; this only
 * picks which button to show.
 */
export function applyAction(item: Import): "apply" | "resume" | undefined {
  if (item.state === "preview") return "apply";
  if (item.state !== "cancelled" && item.state !== "failed") return undefined;
  // Stopped while matching: series are still pending, so there is nothing to apply.
  const pending = item.outcomes.some((o) => o.outcome === "pending" && o.series > 0);
  return pending ? undefined : "resume";
}

/** Whether a series' work can be chosen by hand: it needs one, or it was skipped. */
export function canChoose(row: ImportItem): boolean {
  if (row.result === "skipped") return true;
  return !row.result && (row.outcome === "needs_choice" || row.outcome === "not_found");
}

/** A user keeps at most 20 imports, so the first page (50) holds them all. */
export const importsQuery = () => $api.queryOptions("get", "/me/imports");
export const importQuery = (id: string) => $api.queryOptions("get", "/me/imports/{id}", { params: { path: { id } } });

/** "1 series", "3 series"; "1 chapter", "2 chapters". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "12.5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
