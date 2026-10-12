// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinkOptions } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import { useEvent } from "@/api/events-context";
import type { RunStatus } from "./jobs";
import type { JobsService } from "./service";

/** Where a host shows a job and a run: its own routes (the server's) or its page's search. */
export interface JobsLinks {
  list: LinkOptions;
  job: (jobId: string) => LinkOptions;
  run: (jobId: string, runId: string) => LinkOptions;
}

export interface JobsHost {
  service: JobsService;
  links: JobsLinks;
  /** Inside another page (a tab): headings one level down, no page header. */
  nested: boolean;
}

export const JobsContext = createContext<JobsHost | null>(null);

export function useJobsHost(): JobsHost {
  const host = useContext(JobsContext);
  if (!host) throw new Error("Jobs components need a JobsContext.");
  return host;
}

/** How often to ask while something runs, for services without events (tests shorten it). */
export const POLL = { runMs: 2_000, listMs: 5_000 };

export function useJobList() {
  const { service } = useJobsHost();
  return useQuery({
    queryKey: service.keys.list,
    queryFn: service.list,
    refetchInterval: (query) =>
      service.live === "poll" && query.state.data?.jobs.some((job) => job.running) ? POLL.listMs : false,
  });
}

export function useJob(jobId: string) {
  const { service } = useJobsHost();
  return useQuery({
    queryKey: service.keys.job(jobId),
    queryFn: () => service.job(jobId),
    refetchInterval: (query) => (service.live === "poll" && query.state.data?.running ? POLL.listMs : false),
  });
}

export function useJobRuns(jobId: string, status: RunStatus | undefined, running: boolean) {
  const { service } = useJobsHost();
  return useInfiniteQuery({
    queryKey: service.keys.runs(jobId, status),
    queryFn: ({ pageParam }) =>
      service.runs(jobId, {
        page_size: 25,
        ...(pageParam ? { page_token: pageParam } : {}),
        ...(status ? { status } : {}),
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
    refetchInterval: service.live === "poll" && running ? POLL.listMs : false,
  });
}

/**
 * A run in full, kept live. The server's progress events update it in place (and when it ends
 * the event stream's invalidation fetches the outcome); other services' runs are polled until
 * they end.
 */
export function useRun(runId: string | undefined) {
  const { service } = useJobsHost();
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: service.keys.run(runId ?? ""),
    queryFn: () => service.run(runId ?? ""),
    enabled: !!runId,
    refetchInterval: (query) =>
      service.live === "poll" && query.state.data?.summary.status === "running" ? POLL.runMs : false,
  });
  useEvent("job.progress", (event) => {
    if (service.live !== "events" || !runId || event.run_id !== runId || !event.progress) return;
    queryClient.setQueryData(service.keys.run(runId), (old: typeof run.data) =>
      old ? { ...old, progress: event.progress } : old,
    );
  });
  return run;
}

/** Refreshes every job query of the host's service (after starting or cancelling a run). */
export function useInvalidateJobs() {
  const { service } = useJobsHost();
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ predicate: (query) => service.keys.owns(query.queryKey) });
}
