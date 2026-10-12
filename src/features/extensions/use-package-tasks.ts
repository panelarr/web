// SPDX-License-Identifier: GPL-3.0-or-later

import { type Query, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { TaskEvent } from "@/api/event-types";
import { useEvent } from "@/api/events-context";
import { ACTION_LABELS, type Package, type PackageAction } from "./packages";

const KIND = "plugin.package";
const DONE = new Set(["succeeded", "failed", "cancelled"]);

/** A package's install, update or uninstall that is queued or running. */
export interface OpenTask {
  taskId: string;
  /** Known when started here; from elsewhere, the row looks the task up. */
  action?: PackageAction;
  /** Its latest event, once one has arrived. */
  event?: TaskEvent;
}

/**
 * Starts installs, updates and uninstalls (each a task on the server) and follows them over
 * the event stream. Events carry no payload, so they're matched by task ID: the one the server
 * answered with, or the one a package row carries while its task is open (after a reload, or
 * from another tab). When one ends, the packages, the plugin and the sources are refetched.
 */
export function usePackageTasks(pluginId: string) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<Record<string, TaskEvent>>({});
  const [started, setStarted] = useState<Record<string, { taskId: string; action: PackageAction }>>({});
  // Names for the toasts, by task (ours only) and by package (while its request is on its way).
  const ours = useRef(new Map<string, { name: string; action: PackageAction }>());
  const names = useRef(new Map<string, string>());

  const refresh = useCallback(() => {
    const plugin = (query: Query) => {
      const init = query.queryKey[2] as { params?: { path?: { plugin_id?: string } } } | undefined;
      return init?.params?.path?.plugin_id === pluginId;
    };
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const path = query.queryKey[1];
        if (path === "/sources" || path === "/plugins") return true;
        return (
          (path === "/plugins/{plugin_id}" ||
            path === "/plugins/{plugin_id}/packages" ||
            path === "/plugins/{plugin_id}/packages/{package_id}") &&
          plugin(query)
        );
      },
    });
  }, [queryClient, pluginId]);

  const onTask = (task: TaskEvent) => {
    if (task.kind !== KIND) return;
    setEvents((prev) => ({ ...prev, [task.id]: task }));
    if (!DONE.has(task.state)) return;
    refresh();
    const mine = ours.current.get(task.id);
    if (!mine) return;
    ours.current.delete(task.id);
    if (task.state === "succeeded") toast.success(`${mine.name} ${ACTION_LABELS[mine.action].done}.`);
    else if (task.state === "failed") {
      toast.error(`${mine.name}: ${ACTION_LABELS[mine.action].failed.toLowerCase()}`, {
        description: task.last_error,
      });
    }
  };
  useEvent("task.queued", onTask);
  useEvent("task.started", onTask);
  useEvent("task.progress", onTask);
  useEvent("task.updated", onTask);

  const handlers = (action: PackageAction) => ({
    onSuccess: (ref: { task_id: string }, vars: { params: { path: { package_id: string } } }) => {
      const id = vars.params.path.package_id;
      ours.current.set(ref.task_id, { name: names.current.get(id) ?? id, action });
      setStarted((prev) => ({ ...prev, [id]: { taskId: ref.task_id, action } }));
      refresh();
    },
    onError: (error: unknown, vars: { params: { path: { package_id: string } } }) => {
      const id = vars.params.path.package_id;
      toast.error(`${names.current.get(id) ?? id}: ${ACTION_LABELS[action].failed.toLowerCase()}`, {
        description: errorMessage(error),
      });
    },
  });
  const install = $api.useMutation("post", "/plugins/{plugin_id}/packages/{package_id}/install", handlers("install"));
  const update = $api.useMutation("post", "/plugins/{plugin_id}/packages/{package_id}/update", handlers("update"));
  const uninstall = $api.useMutation("delete", "/plugins/{plugin_id}/packages/{package_id}", handlers("uninstall"));

  /** Starts an action; installing may name the offer (store) to install from. */
  const run = (pkg: Package, action: PackageAction, originId?: string) => {
    names.current.set(pkg.id, pkg.name);
    const params = { path: { plugin_id: pluginId, package_id: pkg.id } };
    if (action === "install") install.mutate({ params, body: originId ? { origin_id: originId } : {} });
    else if (action === "update") update.mutate({ params });
    else uninstall.mutate({ params });
  };

  /** The package's open task, if it has one. */
  const openTask = (pkg: Package): OpenTask | undefined => {
    const mine = started[pkg.id];
    const taskId = pkg.task_id ?? mine?.taskId;
    if (!taskId) return undefined;
    const event = events[taskId];
    if (event && DONE.has(event.state)) return undefined;
    return { taskId, ...(mine?.taskId === taskId ? { action: mine.action } : {}), ...(event ? { event } : {}) };
  };

  /** A request for this package is on its way (before the server answers with a task). */
  const sending = (pkg: Package) =>
    [install, update, uninstall].some((m) => m.isPending && m.variables?.params.path.package_id === pkg.id);

  return { run, openTask, sending };
}

export type PackageTasks = ReturnType<typeof usePackageTasks>;
