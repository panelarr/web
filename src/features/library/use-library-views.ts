// SPDX-License-Identifier: GPL-3.0-or-later

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { $api, api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import type { SavedView, ViewDefinition } from "./library-view";

type ViewList = components["schemas"]["LibraryViewList"];

/** How long the sheet waits after the last change before saving the view. */
export const SAVE_DELAY_MS = 500;

/** Longest name the server takes. */
export const MAX_VIEW_NAME = 60;

const listOptions = () => $api.queryOptions("get", "/me/library-views");

/**
 * The user's saved library views, in their order. Changes show at once and are rolled back
 * when the server refuses them; `library_views.changed` (from other devices too) refetches.
 * Definitions edited in the sheet are kept here as drafts and saved after a short pause.
 */
export function useLibraryViews() {
  const queryClient = useQueryClient();
  const options = listOptions();
  const query = useQuery(options);
  const { queryKey } = options;

  // Definitions changed here and not saved yet (or being saved), by view ID. They win over
  // the server's copy, so a refetch in between doesn't undo what the user just did.
  const [drafts, setDrafts] = useState<Record<string, ViewDefinition>>({});
  const pending = useRef(new Map<string, { definition: ViewDefinition; timer: ReturnType<typeof setTimeout> }>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const waiting = pending.current;
    return () => {
      mounted.current = false;
      // Leaving the page doesn't lose the last change: save it now.
      for (const [id, { definition, timer }] of waiting) {
        clearTimeout(timer);
        void saveDefinition(queryClient, id, definition).catch(() => undefined);
      }
      waiting.clear();
    };
  }, [queryClient]);

  const [saveError, setSaveError] = useState<unknown>();

  const edit = useCallback(
    (id: string, definition: ViewDefinition) => {
      setDrafts((all) => ({ ...all, [id]: definition }));
      const waiting = pending.current;
      clearTimeout(waiting.get(id)?.timer);
      const timer = setTimeout(() => {
        waiting.delete(id);
        saveDefinition(queryClient, id, definition)
          .then(() => {
            if (!mounted.current) return;
            // A newer change is still to be saved: it stays the draft.
            setDrafts((all) => {
              if (all[id] !== definition) return all;
              const { [id]: _, ...rest } = all;
              return rest;
            });
          })
          .catch((error: unknown) => {
            if (!mounted.current) return;
            // Back to what the server has.
            setDrafts((all) => {
              const { [id]: _, ...rest } = all;
              return rest;
            });
            setSaveError(error);
            void queryClient.invalidateQueries({ queryKey });
          });
      }, SAVE_DELAY_MS);
      waiting.set(id, { definition, timer });
    },
    [queryClient, queryKey],
  );

  const views = useMemo(
    () => query.data?.views.map((view) => (drafts[view.id] ? { ...view, definition: drafts[view.id] } : view)),
    [query.data, drafts],
  ) as SavedView[] | undefined;

  /** A change applied to the cached list at once, put back when the server refuses it. */
  const optimistic = <V, R>(apply: (views: SavedView[], vars: V) => SavedView[], call: (vars: V) => Promise<R>) => ({
    mutationFn: call,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient.getQueryData<ViewList>(queryKey);
      if (before) queryClient.setQueryData<ViewList>(queryKey, { views: apply(before.views, vars) });
      return { before };
    },
    onError: (_error: unknown, _vars: V, context: { before: ViewList | undefined } | undefined) => {
      if (context?.before) queryClient.setQueryData(queryKey, context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const create = useMutation({
    mutationFn: async (body: components["schemas"]["CreateLibraryViewRequest"]) => {
      const { data } = await api.POST("/me/library-views", { body });
      return data as SavedView;
    },
    onSuccess: (view) => {
      queryClient.setQueryData<ViewList>(queryKey, (old) => ({
        views: [
          ...(old?.views ?? [])
            .map((v) => (view.default ? { ...v, default: false } : v))
            .filter((v) => v.id !== view.id),
          view,
        ],
      }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const rename = useMutation(
    optimistic(
      (list, { id, name }: { id: string; name: string }) => list.map((v) => (v.id === id ? { ...v, name } : v)),
      ({ id, name }) => api.PATCH("/me/library-views/{id}", { params: { path: { id } }, body: { name } }),
    ),
  );

  const makeDefault = useMutation(
    optimistic(
      (list, id: string) => list.map((v) => ({ ...v, default: v.id === id })),
      (id) => api.PATCH("/me/library-views/{id}", { params: { path: { id } }, body: { default: true } }),
    ),
  );

  const remove = useMutation(
    optimistic(
      (list, id: string) => {
        const gone = list.find((v) => v.id === id);
        const rest = list.filter((v) => v.id !== id).map((v, position) => ({ ...v, position }));
        // As the server does: the default passes to the first remaining view.
        return gone?.default ? rest.map((v, i) => ({ ...v, default: i === 0 })) : rest;
      },
      (id) => api.DELETE("/me/library-views/{id}", { params: { path: { id } } }),
    ),
  );

  const reorder = useMutation(
    optimistic(
      (list, ids: string[]) =>
        ids.flatMap((id, position) => {
          const view = list.find((v) => v.id === id);
          return view ? [{ ...view, position }] : [];
        }),
      (ids) => api.PUT("/me/library-views/order", { body: { ids } }),
    ),
  );

  return { query, views, edit, saveError, create, rename, makeDefault, remove, reorder };
}

export type LibraryViews = ReturnType<typeof useLibraryViews>;

async function saveDefinition(queryClient: QueryClient, id: string, definition: ViewDefinition) {
  const { data } = await api.PATCH("/me/library-views/{id}", { params: { path: { id } }, body: { definition } });
  if (!data) return;
  queryClient.setQueryData<ViewList>(listOptions().queryKey, (old) =>
    old ? { views: old.views.map((v) => (v.id === id ? data : v)) } : old,
  );
}

/**
 * A name for a copy of a view that none of `taken` has (ignoring case, as the server does):
 * "Name copy", then "Name copy 2", … within the server's length limit.
 */
export function copyName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? " copy" : ` copy ${i}`;
    const candidate = `${name.slice(0, MAX_VIEW_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
