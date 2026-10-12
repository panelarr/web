// SPDX-License-Identifier: GPL-3.0-or-later

import { Package as PackageIcon } from "lucide-react";
import { useMemo } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { NativeSelect } from "@/components/native-select";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Input } from "@/components/ui/input";
import { VirtualList } from "@/components/virtual-list";
import { PackageActions, PackageFacts } from "./package-parts";
import { PackageSheet } from "./package-sheet";
import { filterPackages, type Package, type PackageFilter, packageLanguages } from "./packages";
import { type PackageTasks, usePackageTasks } from "./use-package-tasks";

export interface ExtensionsSearch extends PackageFilter {
  /** The package whose details are open. */
  pkg?: string;
}

/**
 * A plugin's packages (extensions) from all its stores: search, a language filter, install,
 * update and uninstall with live progress, and each one's details. Only for plugins with the
 * packages capability.
 */
export function ExtensionsPanel({
  pluginId,
  search,
  onSearch,
}: {
  pluginId: string;
  search: ExtensionsSearch;
  onSearch: (change: Partial<ExtensionsSearch>) => void;
}) {
  const list = $api.useQuery("get", "/plugins/{plugin_id}/packages", { params: { path: { plugin_id: pluginId } } });
  const tasks = usePackageTasks(pluginId);
  const all = list.data?.packages ?? [];
  const langs = useMemo(() => packageLanguages(all), [all]);
  const shown = useMemo(() => filterPackages(all, search), [all, search]);
  const installed = all.filter((p) => p.installed).length;
  const updates = all.filter((p) => p.update_available).length;
  const open = all.find((p) => p.id === search.pkg);

  if (isApiError(list.error, "plugin_disabled")) {
    return (
      <EmptyState icon={<PackageIcon />} title="The plugin is turned off">
        Turn it on to see and manage its extensions.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <Input
          type="search"
          placeholder="Search extensions"
          aria-label="Search extensions"
          value={search.q ?? ""}
          onChange={(e) => onSearch({ q: e.target.value || undefined })}
        />
        <NativeSelect
          aria-label="Language"
          value={search.lang ?? ""}
          onChange={(e) => onSearch({ lang: e.target.value || undefined })}
        >
          <option value="">All languages</option>
          {langs.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Show"
          value={search.show ?? ""}
          onChange={(e) => onSearch({ show: (e.target.value || undefined) as ExtensionsSearch["show"] })}
        >
          <option value="">All extensions</option>
          <option value="installed">Installed ({installed})</option>
          <option value="updates">Updates ({updates})</option>
        </NativeSelect>
      </div>
      {list.data ? (
        <p className="text-sm text-muted-foreground">
          {shown.length === all.length ? `${all.length} extensions` : `${shown.length} of ${all.length} extensions`} ·{" "}
          {installed} installed{updates ? ` · ${updates} with an update` : ""}
        </p>
      ) : null}
      {list.error ? (
        <ErrorAlert
          error={list.error}
          title={
            isApiError(list.error, "store_fetch_failed") || isApiError(list.error, "store_invalid")
              ? "A store couldn't be read"
              : undefined
          }
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {list.isPending ? <Loading /> : null}
      {list.data && shown.length === 0 ? (
        <EmptyState icon={<PackageIcon />} title={all.length === 0 ? "No extensions" : "No extension matches"}>
          {all.length === 0 ? "Add a store in the plugin's settings to see what it offers." : "Try other filters."}
        </EmptyState>
      ) : null}
      {shown.length > 0 ? (
        <VirtualList
          label="Extensions"
          items={shown}
          getKey={(p) => p.id}
          estimateSize={88}
          className="overflow-hidden rounded-xl border bg-card"
          renderItem={(pkg, index) => (
            <PackageRow pkg={pkg} tasks={tasks} first={index === 0} onOpen={() => onSearch({ pkg: pkg.id })} />
          )}
        />
      ) : null}
      <PackageSheet
        pluginId={pluginId}
        pkg={open}
        tasks={tasks}
        onOpenChange={(next) => {
          if (!next) onSearch({ pkg: undefined });
        }}
      />
    </div>
  );
}

function PackageRow({
  pkg,
  tasks,
  first,
  onOpen,
}: {
  pkg: Package;
  tasks: PackageTasks;
  first: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={first ? "flex flex-wrap items-start gap-3 p-4" : "flex flex-wrap items-start gap-3 border-t p-4"}>
      <SourceIcon name={pkg.name} url={pkg.icon_url} className="mt-0.5" />
      <div className="min-w-0 flex-1 basis-48">
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
        >
          {pkg.name}
        </button>
        <PackageFacts pkg={pkg} />
        {pkg.error ? <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{pkg.error}</p> : null}
      </div>
      <PackageActions pkg={pkg} tasks={tasks} />
    </div>
  );
}
