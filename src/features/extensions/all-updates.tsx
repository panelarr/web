// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { ChevronRight, Package as PackageIcon } from "lucide-react";
import { useState } from "react";
import { isApiError } from "@/api/errors";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";
import { PackageActions, PackageFacts } from "./package-parts";
import type { Package } from "./packages";
import { type PluginUpdates, useAllUpdates } from "./use-all-updates";
import { type PackageTasks, usePackageTasks } from "./use-package-tasks";

/**
 * Admin → Updates: the extensions with an update, from every plugin that manages packages, to
 * update one by one or all of a plugin's at once. Each plugin is a section of its own that
 * loads and fails on its own; the page never waits for a slow store.
 */
export function AllUpdates() {
  const { plugins, sections, total } = useAllUpdates();
  const loading = sections.some((s) => s.updates?.isPending);
  return (
    <>
      <PageHeader
        title="Updates"
        description={
          sections.length > 0
            ? `${total} ${total === 1 ? "extension has" : "extensions have"} an update${loading ? " so far" : ""}.`
            : "Extensions with a newer version in their store."
        }
      />
      {plugins.error ? <ErrorAlert error={plugins.error} onRetry={() => void plugins.refetch()} /> : null}
      {plugins.isPending ? <Loading /> : null}
      {plugins.data && sections.length === 0 ? (
        <EmptyState icon={<PackageIcon />} title="No plugin manages extensions">
          Updates show here for plugins that install extensions from stores. Plugins are optional; add one in{" "}
          <Link to="/admin/plugins" className="text-foreground underline underline-offset-4">
            Plugins
          </Link>
          .
        </EmptyState>
      ) : null}
      <div className="grid gap-6">
        {sections.map((section) => (
          <PluginUpdatesCard key={section.plugin.id} section={section} />
        ))}
      </div>
    </>
  );
}

function PluginUpdatesCard({ section: { plugin, updates } }: { section: PluginUpdates }) {
  const tasks = usePackageTasks(plugin.id);
  const packages = updates?.data?.packages ?? [];
  const headingId = `updates-${plugin.id}`;
  return (
    <Card aria-labelledby={headingId} role="region">
      <CardHeader>
        <CardTitle id={headingId} className="[overflow-wrap:anywhere]">
          {plugin.name}
        </CardTitle>
        <CardDescription>
          <Link
            to="/admin/plugins/$pluginId"
            params={{ pluginId: plugin.id }}
            search={{ tab: "extensions", show: "updates" }}
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            Its extensions
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </CardDescription>
        {packages.length > 0 ? (
          <CardAction>
            <UpdateAll pluginName={plugin.name} packages={packages} tasks={tasks} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {!updates ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <HealthBadge status="off" />
            Turned off: turn it on to see its updates.
          </p>
        ) : updates.error ? (
          <ErrorAlert
            error={updates.error}
            title={
              isApiError(updates.error, "store_fetch_failed") || isApiError(updates.error, "store_invalid")
                ? "A store couldn't be read"
                : "Its updates couldn't be loaded"
            }
            onRetry={() => void updates.refetch()}
          />
        ) : updates.isPending ? (
          <Loading />
        ) : packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything is up to date.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label={`Updates from ${plugin.name}`}>
            {packages.map((pkg) => (
              <li key={pkg.id} className="flex flex-wrap items-start gap-3 p-4">
                <SourceIcon name={pkg.name} url={pkg.icon_url} className="mt-0.5" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-medium [overflow-wrap:anywhere]">{pkg.name}</p>
                  <PackageFacts pkg={pkg} />
                  {pkg.error ? (
                    <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{pkg.error}</p>
                  ) : null}
                  {tasks.failure(pkg) ? (
                    <p role="alert" className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">
                      {tasks.failure(pkg)}
                    </p>
                  ) : null}
                </div>
                <PackageActions pkg={pkg} tasks={tasks} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Updates every one of a plugin's packages that can be, asked first. */
function UpdateAll({ pluginName, packages, tasks }: { pluginName: string; packages: Package[]; tasks: PackageTasks }) {
  const [confirming, setConfirming] = useState(false);
  // Not those already under way, nor versions the plugin can't run.
  const ready = packages.filter((p) => p.supported && !tasks.openTask(p) && !tasks.sending(p));
  if (ready.length === 0) return null;
  return (
    <>
      <Button size="sm" onClick={() => setConfirming(true)}>
        Update all ({ready.length})
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Update {ready.length} {ready.length === 1 ? "extension" : "extensions"} of {pluginName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each is queued as its own task: {ready.map((p) => p.name).join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                for (const pkg of ready) tasks.run(pkg, "update");
              }}
            >
              Update all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
