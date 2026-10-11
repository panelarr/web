// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { type ReaderSettings, type ResolvedSettings, resolve } from "./settings";

/** Where a change made in the reader is saved. */
export type SaveLevel = "work" | "source" | "global";

/**
 * The reader settings for a work on a source: every level, merged over the work type's
 * defaults, with where each value comes from. Changes are saved to the level asked for.
 */
export function useReaderSettings(workId: string | undefined, sourceId: string | undefined, type: string | undefined) {
  const queryClient = useQueryClient();
  const init = {
    params: { query: { ...(workId ? { work_id: workId } : {}), ...(sourceId ? { source_id: sourceId } : {}) } },
  };
  const options = $api.queryOptions("get", "/me/reader-settings", init);
  const query = $api.useQuery("get", "/me/reader-settings", init, {
    enabled: !!workId && !!sourceId,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const levels = query.data ?? { effective: {} };
  const resolved: ResolvedSettings = resolve(type, levels);

  const scopeOf = (level: SaveLevel) =>
    level === "global" ? "global" : level === "source" ? `source:${sourceId}` : `work:${workId}`;
  const keyOf = (level: SaveLevel) => (level === "global" ? "global" : level);

  const put = $api.useMutation("put", "/me/reader-settings/{scope}", {
    onError: (error) => {
      toast.error(`Settings not saved: ${errorMessage(error)}`);
      void queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  });
  const remove = $api.useMutation("delete", "/me/reader-settings/{scope}", {
    onSettled: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
  });

  /** Changes settings at one level (optimistically: the reader updates at once). */
  const update = (change: Partial<ReaderSettings>, level: SaveLevel) => {
    const key = keyOf(level);
    const current = (levels as Record<string, Record<string, unknown> | undefined>)[key] ?? {};
    const next = { ...current, ...change };
    queryClient.setQueryData(options.queryKey, {
      ...levels,
      [key]: next,
      effective: { ...levels.effective, ...change },
    });
    put.mutate({ params: { path: { scope: scopeOf(level) } }, body: next });
  };

  /** Drops a level, falling back to the broader ones. */
  const reset = (level: SaveLevel) => {
    const key = keyOf(level);
    const { [key]: _gone, ...rest } = levels as Record<string, unknown>;
    queryClient.setQueryData(options.queryKey, { ...rest, effective: {} });
    remove.mutate({ params: { path: { scope: scopeOf(level) } } });
  };

  return { ...resolved, loading: query.isPending && !!workId, levels, update, reset };
}
