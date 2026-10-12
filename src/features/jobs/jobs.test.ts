// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  cronText,
  every,
  initialParamValue,
  type Job,
  type JobParam,
  paramLabel,
  paramsToSend,
  perSourceJobs,
  scheduleText,
} from "./jobs";

describe("schedules", () => {
  it("read like words", () => {
    expect(every(21_600)).toBe("every 6 hours");
    expect(every(300)).toBe("every 5 minutes");
    expect(every(86_400)).toBe("every day");
    expect(every(90)).toBe("every 90 seconds");
    expect(scheduleText({ enabled: true, interval_seconds: 3_600 })).toBe("Runs every hour");
    expect(scheduleText({ enabled: false, interval_seconds: 3_600 })).toBe("Schedule off (every hour)");
    expect(scheduleText({ enabled: false })).toBe("Runs by hand only");
  });

  it("from cron read like words where they can, in UTC", () => {
    expect(cronText("0 3 * * *")).toBe("daily at 03:00 UTC");
    expect(cronText("30 4 * * 1")).toBe("every Monday at 04:30 UTC");
    expect(cronText("30 4 * * 0")).toBe("every Sunday at 04:30 UTC");
    expect(cronText("30 4 * * 7")).toBe("every Sunday at 04:30 UTC");
    expect(cronText("15 22 * * FRI")).toBe("every Friday at 22:15 UTC");
    expect(cronText("0 9 * * 1-5")).toBe("on weekdays at 09:00 UTC");
    expect(cronText("0 2 1 * *")).toBe("monthly on day 1 at 02:00 UTC");
    expect(cronText("*/15 * * * *")).toBe("every 15 minutes");
    expect(cronText("0 * * * *")).toBe("every hour");
    expect(cronText("5 * * * *")).toBe("every hour at :05");
    expect(cronText("0 */6 * * *")).toBe("every 6 hours");
    expect(cronText("10 */6 * * *")).toBe("every 6 hours at :10");
  });

  it("from cron fall back to the expression, saying it's UTC", () => {
    expect(cronText("0 3 * 1 *")).toBe("on schedule 0 3 * 1 * (UTC)");
    expect(cronText("0 3,15 * * *")).toBe("on schedule 0 3,15 * * * (UTC)");
    expect(cronText("@daily")).toBe("on schedule @daily (UTC)");
    expect(cronText("0 25 * * *")).toBe("on schedule 0 25 * * * (UTC)");
  });

  it("show a cron schedule, on or off, never as by hand only", () => {
    expect(scheduleText({ enabled: true, cron: "0 3 * * *" })).toBe("Runs daily at 03:00 UTC");
    expect(scheduleText({ enabled: false, cron: "30 4 * * 1" })).toBe("Schedule off (every Monday at 04:30 UTC)");
  });
});

describe("run parameters", () => {
  const params: JobParam[] = [
    { name: "force", type: "bool", required: false, default: "false" },
    { name: "langs", type: "string_list", required: false, choices: ["en", "ja"] },
    { name: "keep_days", type: "int", required: true, default: "30" },
    { name: "note", type: "string", required: false },
  ];

  it("are labelled in words", () => {
    expect(paramLabel("keep_days")).toBe("Keep days");
    expect(paramLabel("langs")).toBe("Langs");
  });

  it("start from their defaults", () => {
    expect(params.map(initialParamValue)).toEqual([false, [], "30", ""]);
  });

  it("send only what differs from the defaults, lists comma-separated", () => {
    expect(paramsToSend(params, { force: false, langs: [], keep_days: "30", note: "" })).toEqual({ keep_days: "30" });
    expect(paramsToSend(params, { force: true, langs: ["en", "ja"], keep_days: "7", note: " hi " })).toEqual({
      force: "true",
      langs: "en,ja",
      keep_days: "7",
      note: "hi",
    });
  });
});

describe("per-source jobs", () => {
  const job = (id: string, group: string, name: string, params: JobParam[]): Job => ({
    id,
    name,
    group,
    description: "",
    schedule: { enabled: false },
    running: false,
    cancellable: false,
    params,
  });
  const sourceIds: JobParam = { name: "source_ids", type: "string_list", required: false };
  const refresh = job("store-refresh", "Stores", "Refresh stores", []);
  const reindex = job("reindex", "Sources", "Reindex", [sourceIds]);
  const check = job("source-health", "health", "Check sources", [sourceIds]);
  const deep = job("deep", "Other", "Deep health check", [sourceIds]);

  it("are the jobs taking a source_ids list", () => {
    expect(perSourceJobs([refresh, reindex])).toEqual([reindex]);
    expect(perSourceJobs([refresh])).toEqual([]);
    expect(perSourceJobs([job("x", "", "X", [{ ...sourceIds, type: "string" }])])).toEqual([]);
  });

  it("prefer health checks, by group or name, else offer them all", () => {
    expect(perSourceJobs([reindex, check])).toEqual([check]);
    expect(perSourceJobs([reindex, check, deep])).toEqual([check, deep]);
    expect(perSourceJobs([reindex, job("y", "Sources", "Y", [sourceIds])]).map((j) => j.id)).toEqual(["reindex", "y"]);
  });
});
