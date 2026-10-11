// SPDX-License-Identifier: GPL-3.0-or-later

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { EventStream } from "./events";

function setup() {
  const queryClient = new QueryClient();
  for (const path of ["/jobs", "/jobs/{job_id}", "/job-runs/{run_id}", "/tasks", "/me"]) {
    queryClient.setQueryData(["get", path, {}], { cached: true });
  }
  const stream = new EventStream(queryClient, "http://localhost/api/v1/events");
  const stale = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey[1]);
  return { queryClient, stream, stale };
}

describe("EventStream", () => {
  it("invalidates the queries an event affects", () => {
    const { stream, stale } = setup();
    stream.dispatch("job.done", JSON.stringify({ job_id: "update-check" }));
    expect(stale()).toEqual(["/jobs", "/jobs/{job_id}", "/job-runs/{run_id}"]);
  });

  it("passes the parsed data to listeners", () => {
    const { stream } = setup();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe("task.progress", listener);
    stream.dispatch("task.progress", JSON.stringify({ done: 3, total: 10 }));
    expect(listener).toHaveBeenCalledWith({ done: 3, total: 10 }, "task.progress");
    unsubscribe();
    stream.dispatch("task.progress", "{}");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("leaves unrelated queries alone", () => {
    const { stream, stale } = setup();
    stream.dispatch("something.else", "{}");
    expect(stale()).toEqual([]);
  });
});
