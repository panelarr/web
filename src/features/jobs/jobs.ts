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

/** How a run started, in words; "system" runs are started by the service that owns the job. */
export function triggerText(trigger: string, owner = "the server"): string {
  return trigger === "system" ? `by ${owner}` : (TRIGGERS[trigger] ?? trigger);
}

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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const number = (field: string, max: number): number | undefined =>
  /^\d+$/.test(field) && Number(field) <= max ? Number(field) : undefined;

/** A day of the week from cron (0–7, Sunday twice, or a name). */
function weekday(field: string): string | undefined {
  const n = number(field, 7);
  if (n !== undefined) return DAYS[n % 7];
  const i = DAY_NAMES.indexOf(field.toUpperCase());
  return i >= 0 ? DAYS[i] : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A cron schedule in words where it's a common one ("daily at 03:00 UTC", "every Monday at
 * 04:30 UTC", "every 15 minutes"), else as written. The services read cron in UTC.
 */
export function cronText(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  const fallback = `on schedule ${cron.trim()} (UTC)`;
  if (fields.length !== 5) return fallback;
  const [minute = "", hour = "", dom = "", month = "", dow = ""] = fields;
  const m = number(minute, 59);
  const h = number(hour, 23);
  const step = (field: string, max: number) => {
    const match = /^\*\/(\d+)$/.exec(field);
    return match && Number(match[1]) > 0 && Number(match[1]) <= max ? Number(match[1]) : undefined;
  };
  const anyDay = dom === "*" && month === "*" && dow === "*";
  if (anyDay && hour === "*" && step(minute, 59)) return every(60 * (step(minute, 59) ?? 1));
  if (anyDay && hour === "*" && m !== undefined) return m === 0 ? "every hour" : `every hour at :${pad(m)}`;
  if (anyDay && m !== undefined && step(hour, 23)) {
    const text = every(3_600 * (step(hour, 23) ?? 1));
    return m === 0 ? text : `${text} at :${pad(m)}`;
  }
  if (m === undefined || h === undefined || month !== "*") return fallback;
  const at = `at ${pad(h)}:${pad(m)} UTC`;
  if (dom === "*" && dow === "*") return `daily ${at}`;
  if (dom === "*" && weekday(dow)) return `every ${weekday(dow)} ${at}`;
  if (dom === "*" && (dow === "1-5" || dow.toUpperCase() === "MON-FRI")) return `on weekdays ${at}`;
  const day = number(dom, 31);
  if (dow === "*" && day !== undefined && day >= 1) return `monthly on day ${day} ${at}`;
  return fallback;
}

/** How a job runs on its own, in a few words. */
export function scheduleText(schedule: Job["schedule"]): string {
  const text = schedule.cron
    ? cronText(schedule.cron)
    : schedule.interval_seconds
      ? every(schedule.interval_seconds)
      : undefined;
  if (!text) return "Runs by hand only";
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

/** The spec names parameters for machines (keep_days); show them as words (Keep days). */
export function paramLabel(name: string): string {
  const words = name.replaceAll(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The parameter that makes a job a per-source one (contracts/jobs.md). */
export const SOURCE_IDS_PARAM = "source_ids";

/**
 * A plugin's jobs that can run for one source: they take a `source_ids` list. When several do,
 * health checks come first (by group or name); one left means a plain "Check now", more a menu.
 */
export function perSourceJobs(jobs: readonly Job[]): Job[] {
  const candidates = jobs.filter((job) =>
    job.params.some((param) => param.name === SOURCE_IDS_PARAM && param.type === "string_list"),
  );
  const health = candidates.filter((job) => /health/i.test(job.group) || /health/i.test(job.name));
  return health.length > 0 ? health : candidates;
}
