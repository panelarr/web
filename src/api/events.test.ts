// SPDX-License-Identifier: GPL-3.0-or-later

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { EventStream } from "./events";

function setup() {
  const queryClient = new QueryClient();
  for (const path of ["/jobs", "/jobs/{job_id}", "/job-runs/{run_id}", "/tasks", "/me", "/library"]) {
    queryClient.setQueryData(["get", path, {}], { cached: true });
  }
  queryClient.setQueryData(["library-index"], new Map());
  const stream = new EventStream(queryClient, "http://localhost/api/v1/events");
  const stale = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey[1] ?? query.queryKey[0]);
  return { queryClient, stream, stale };
}

describe("EventStream", () => {
  it("invalidates the queries an event affects, in one batch", () => {
    const { stream, stale } = setup();
    stream.dispatch("job.done", JSON.stringify({ job_id: "update-check", run_id: "r" }));
    stream.dispatch("job.started", JSON.stringify({ job_id: "other", run_id: "s" }));
    expect(stale()).toEqual([]); // batched
    stream.flush();
    expect(stale()).toEqual(["/jobs", "/jobs/{job_id}", "/job-runs/{run_id}"]);
  });

  it("refreshes the library marks when the library changes", () => {
    const { stream, stale } = setup();
    stream.dispatch("library.changed", JSON.stringify({ work_id: "w" }));
    stream.flush();
    expect(stale()).toEqual(["/library", "library-index"]);
  });

  it("refreshes one plugin on its health event, but leaves its settings alone", () => {
    const { queryClient, stream } = setup();
    const plugin = (id: string) => ["get", "/plugins/{plugin_id}", { params: { path: { plugin_id: id } } }];
    queryClient.setQueryData(plugin("a"), { id: "a", health: "ok" });
    queryClient.setQueryData(plugin("b"), { id: "b", health: "ok" });
    queryClient.setQueryData(["get", "/plugins", {}], { plugins: [{ id: "a", health: "ok" }] });
    queryClient.setQueryData(["get", "/sources", { params: { query: { plugin: "a" } } }], { sources: [] });
    const config = ["get", "/plugins/{plugin_id}/config", { params: { path: { plugin_id: "a" } } }];
    queryClient.setQueryData(config, { values: {} });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const event = JSON.stringify({ plugin_id: "a", health: "degraded", health_message: "store can't be reached" });
    stream.dispatch("plugin.health", event);
    stream.dispatch("plugin.health", event); // checks repeat: one refetch
    // The health shows at once, before any refetch.
    expect(queryClient.getQueryData(plugin("a"))).toEqual({
      id: "a",
      health: "degraded",
      health_message: "store can't be reached",
    });
    expect(queryClient.getQueryData(["get", "/plugins", {}])).toEqual({
      plugins: [{ id: "a", health: "degraded", health_message: "store can't be reached" }],
    });
    stream.flush();
    expect(invalidate).toHaveBeenCalledTimes(1);
    const stale = (key: unknown[]) =>
      queryClient.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;
    expect(stale(plugin("a"))).toBe(true);
    expect(stale(["get", "/plugins", {}])).toBe(true);
    expect(stale(["get", "/sources", { params: { query: { plugin: "a" } } }])).toBe(true);
    expect(stale(plugin("b"))).toBe(false);
    expect(stale(config)).toBe(false);

    // Back to healthy: the old message goes.
    stream.dispatch("plugin.health", JSON.stringify({ plugin_id: "a", health: "ok" }));
    expect(queryClient.getQueryData(plugin("a"))).toEqual({ id: "a", health: "ok" });
  });

  it("patches task progress in place instead of refetching", () => {
    const { queryClient, stream, stale } = setup();
    queryClient.setQueryData(["get", "/tasks", { params: { query: {} } }], {
      tasks: [
        { id: "t1", state: "queued", attempts: 0 },
        { id: "t2", state: "running", attempts: 1 },
      ],
      next_page_token: "",
    });
    stream.dispatch(
      "task.progress",
      JSON.stringify({
        id: "t2",
        kind: "download.chapter",
        state: "running",
        attempts: 1,
        progress: { done: 3, total: 10 },
      }),
    );
    stream.flush();
    expect(stale()).toEqual([]);
    const data = queryClient.getQueryData<{ tasks: Array<{ id: string; progress?: unknown }> }>([
      "get",
      "/tasks",
      { params: { query: {} } },
    ]);
    expect(data?.tasks[1]?.progress).toEqual({ done: 3, total: 10 });
    expect(data?.tasks[0]?.progress).toBeUndefined();
  });

  it("patches every page of an infinite task list", () => {
    const { queryClient, stream } = setup();
    const key = ["get", "/tasks", { params: { query: { state: "running" } } }];
    queryClient.setQueryData(key, {
      pages: [{ tasks: [{ id: "t1", state: "running", attempts: 1 }], next_page_token: "" }],
      pageParams: [""],
    });
    stream.dispatch(
      "task.progress",
      JSON.stringify({ id: "t1", kind: "k", state: "running", attempts: 1, progress: { done: 5 } }),
    );
    const data = queryClient.getQueryData<{ pages: Array<{ tasks: Array<{ progress?: unknown }> }> }>(key);
    expect(data?.pages[0]?.tasks[0]?.progress).toEqual({ done: 5 });
  });

  it("passes the parsed data to listeners", () => {
    const { stream } = setup();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe("job.progress", listener);
    stream.dispatch("job.progress", JSON.stringify({ job_id: "j", run_id: "r", progress: { done: 1 } }));
    expect(listener).toHaveBeenCalledWith({ job_id: "j", run_id: "r", progress: { done: 1 } }, "job.progress");
    unsubscribe();
    stream.dispatch("job.progress", "{}");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("leaves unrelated queries alone", () => {
    const { stream, stale } = setup();
    stream.dispatch("something.else", "{}");
    stream.flush();
    expect(stale()).toEqual([]);
  });
});
