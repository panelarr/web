// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { every, initialParamValue, type JobParam, paramsToSend, scheduleText } from "./jobs";

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
});

describe("run parameters", () => {
  const params: JobParam[] = [
    { name: "force", type: "bool", required: false, default: "false" },
    { name: "langs", type: "string_list", required: false, choices: ["en", "ja"] },
    { name: "keep_days", type: "int", required: true, default: "30" },
    { name: "note", type: "string", required: false },
  ];

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
