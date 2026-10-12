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

/** After a time: " UTC", " (Europe/Vilnius)", or, when the service doesn't say, its own zone. */
function zoneText(timeZone: string | undefined): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return " UTC";
  return timeZone ? ` (${timeZone})` : " (the service's time zone)";
}

/** "1h30m" (a Go duration, as in "@every 1h30m") in seconds; undefined when it isn't one. */
function goDuration(text: string): number | undefined {
  if (!/^(\d+(\.\d+)?(h|m|s|ms))+$/.test(text)) return undefined;
  const scale: Record<string, number> = { h: 3_600, m: 60, s: 1, ms: 0.001 };
  let seconds = 0;
  for (const [, n, , unit] of text.matchAll(/(\d+(\.\d+)?)(ms|h|m|s)/g))
    seconds += Number(n) * (scale[unit ?? "s"] ?? 0);
  return Math.round(seconds);
}

/** The @ shorthands: "@every 1h" is an interval (no zone); "@daily" and the like are cron. */
function macroText(expression: string, zone: string | undefined): string | undefined {
  const interval = /^@every\s+(\S+)$/.exec(expression);
  if (interval) {
    const seconds = goDuration(interval[1] ?? "");
    return seconds ? every(seconds) : undefined;
  }
  const midnight = `at 00:00${zoneText(zone)}`;
  const named: Record<string, string> = {
    "@hourly": "every hour",
    "@daily": `daily ${midnight}`,
    "@midnight": `daily ${midnight}`,
    "@weekly": `every Sunday ${midnight}`,
    "@monthly": `monthly on day 1 ${midnight}`,
    "@yearly": `every 1 January ${midnight}`,
    "@annually": `every 1 January ${midnight}`,
  };
  return named[expression.toLowerCase()];
}

/**
 * A cron schedule in words where it's a common one ("daily at 03:00 UTC", "every Monday at
 * 04:30 UTC", "every 15 minutes"), else as written, with the time zone it runs in: the
 * schedule's `time_zone`, else one the expression names (CRON_TZ=…), else the service's own.
 */
export function cronText(cron: string, timeZone?: string): string {
  const named = /^(?:CRON_TZ|TZ)=(\S+)\s+(.*)$/.exec(cron.trim());
  const expression = named ? (named[2] ?? "") : cron.trim();
  const zone = timeZone ?? named?.[1];
  const macro = macroText(expression, zone);
  if (macro) return macro;
  const fields = expression.split(/\s+/);
  const fallback = `on schedule ${expression}${zone ? ` (${zone})` : " (the service's time zone)"}`;
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
  const at = `at ${pad(h)}:${pad(m)}${zoneText(zone)}`;
  if (dom === "*" && dow === "*") return `daily ${at}`;
  if (dom === "*" && weekday(dow)) return `every ${weekday(dow)} ${at}`;
  if (dom === "*" && (dow === "1-5" || dow.toUpperCase() === "MON-FRI")) return `on weekdays ${at}`;
  const day = number(dom, 31);
  if (dow === "*" && day !== undefined && day >= 1) return `monthly on day ${day} ${at}`;
  return fallback;
}

/**
 * How a job runs on its own, in a few words. A job that can't run now (`disabled_reason`) keeps
 * its schedule as configured but doesn't fire: paused.
 */
export function scheduleText(schedule: Job["schedule"], disabledReason?: string): string {
  const text = schedule.cron
    ? cronText(schedule.cron, schedule.time_zone)
    : schedule.interval_seconds
      ? every(schedule.interval_seconds)
      : undefined;
  if (!text) return "Runs by hand only";
  if (!schedule.enabled) return `Schedule off (${text})`;
  return disabledReason ? `Paused (${text})` : `Runs ${text}`;
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
  let candidates = jobs.filter((job) =>
    job.params.some((param) => param.name === SOURCE_IDS_PARAM && param.type === "string_list"),
  );
  // One that can't run now is no use for "Check now".
  candidates = candidates.filter((job) => !job.disabled_reason);
  const health = candidates.filter((job) => /health/i.test(job.group) || /health/i.test(job.name));
  return health.length > 0 ? health : candidates;
}

/** How long something ran ("1 min 4 s"), up to now while it runs. */
export function duration(from: string, to: string | undefined): string {
  const ms = (to ? Date.parse(to) : Date.now()) - Date.parse(from);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60
    ? `${s} s`
    : s < 3600
      ? `${Math.floor(s / 60)} min ${s % 60} s`
      : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
