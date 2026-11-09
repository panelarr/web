// SPDX-License-Identifier: GPL-3.0-or-later

import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { sortPackages } from "./packages";
import { updatesListOptions } from "./use-package-tasks";

type Plugin = components["schemas"]["Plugin"];
type PackageList = components["schemas"]["PackageList"];

/** One plugin that manages packages, with its updates (asked only while it's on). */
export interface PluginUpdates {
  plugin: Plugin;
  /** Undefined while the plugin is off: there's nothing to ask. */
  updates: UseQueryResult<PackageList, unknown> | undefined;
}

/**
 * Every plugin with the `packages` capability and, for each one that's on, its installed
 * packages with an update. Each plugin is asked on its own: a slow or failing store holds up
 * only its own section.
 */
export function useAllUpdates() {
  const plugins = $api.useQuery("get", "/plugins");
  const managing = (plugins.data?.plugins ?? []).filter((p) => p.capabilities.includes("packages"));
  const on = managing.filter((p) => p.enabled);
  const lists = useQueries({
    queries: on.map((p) => ({
      ...updatesListOptions(p.id),
      select: (data: PackageList) => ({ ...data, packages: sortPackages(data.packages) }),
    })),
  });
  const sections: PluginUpdates[] = managing.map((plugin) => ({
    plugin,
    updates: plugin.enabled ? lists[on.indexOf(plugin)] : undefined,
  }));
  /** Updates found so far, over the plugins that have answered. */
  const total = sections.reduce((sum, s) => sum + (s.updates?.data?.packages.length ?? 0), 0);
  return { plugins, sections, total };
}
