// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { $api } from "@/api/client";
import { useEvent } from "@/api/events-context";

/**
 * A run in full, kept live: progress events update it in place, and when it ends the event
 * stream's invalidation fetches the outcome.
 */
export function useRun(runId: string | undefined) {
  const queryClient = useQueryClient();
  const init = { params: { path: { run_id: runId ?? "" } } };
  const run = $api.useQuery("get", "/job-runs/{run_id}", init, { enabled: !!runId });
  useEvent("job.progress", (event) => {
    if (!runId || event.run_id !== runId || !event.progress) return;
    queryClient.setQueryData($api.queryOptions("get", "/job-runs/{run_id}", init).queryKey, (old) =>
      old ? { ...old, progress: event.progress } : old,
    );
  });
  return run;
}
