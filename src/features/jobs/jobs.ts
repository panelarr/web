// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";

type S = components["schemas"];
export type Job = S["Job"];
export type JobParam = S["JobParam"];
export type RunStatus = S["JobRunStatus"];

export const RUN_STATUS: Record<RunStatus, { label: string; tone: "good" | "bad" | "warn" | "info" | "neutral" }> = {
  running: { label: "Running", tone: "info" },
  succeeded: { label: "Succeeded", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "warn" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export const TRIGGERS: Record<string, string> = {
  schedule: "on schedule",
  manual: "by hand",
  startup: "at startup",
  system: "by the server",
};

/** "every 6 hours" from seconds. */
export function every(seconds: number): string {
  const units: Array<[number, string]> = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
    }
  }
  return `every ${seconds} seconds`;
}

/** How a job runs on its own, in a few words. */
export function scheduleText(schedule: Job["schedule"]): string {
  if (!schedule.interval_seconds) return "Runs by hand only";
  const text = every(schedule.interval_seconds);
  return schedule.enabled ? `Runs ${text}` : `Schedule off (${text})`;
}

export type ParamValue = boolean | string | string[];

/** The value a parameter starts with in the run form: its default. */
export function initialParamValue(param: JobParam): ParamValue {
  if (param.type === "bool") return param.default === "true";
  if (param.type === "string_list") return param.default ? param.default.split(",").map((s) => s.trim()) : [];
  return param.default ?? "";
}

/**
 * The parameters to send: as strings (lists comma-separated, as the server reads them),
 * leaving out anything still at its default so the server's default applies.
 */
export function paramsToSend(params: JobParam[], values: Record<string, ParamValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const param of params) {
    const value = values[param.name];
    if (value === undefined) continue;
    const text = Array.isArray(value) ? value.join(",") : typeof value === "boolean" ? String(value) : value.trim();
    if (text === "" && !param.required) continue;
    if (text === (param.default ?? "") && !param.required) continue;
    out[param.name] = text;
  }
  return out;
}

/** "Runs with force: false, sources: all" for a schedule's defaults. */
export function defaultsText(params: JobParam[]): string | undefined {
  const parts = params.filter((p) => p.default !== undefined && p.default !== "").map((p) => `${p.name}: ${p.default}`);
  return parts.length > 0 ? `With ${parts.join(", ")}` : undefined;
}
