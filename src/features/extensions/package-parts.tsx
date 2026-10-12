// SPDX-License-Identifier: GPL-3.0-or-later

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, originLabel, type Package, versionLabel } from "./packages";
import type { PackageTasks } from "./use-package-tasks";

/** Languages, version, rating and store, in one wrapping line. */
export function PackageFacts({ pkg }: { pkg: Package }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {pkg.langs.slice(0, 4).map((lang) => (
        <Badge key={lang} variant="outline" className="uppercase">
          {lang}
        </Badge>
      ))}
      {pkg.langs.length > 4 ? <span>+{pkg.langs.length - 4}</span> : null}
      <span className="tabular-nums">{versionLabel(pkg)}</span>
      {pkg.update_available ? <Badge>Update</Badge> : null}
      {pkg.installed ? <Badge variant="secondary">Installed</Badge> : null}
      {pkg.content_rating === "nsfw" ? <Badge variant="destructive">NSFW</Badge> : null}
      {pkg.content_rating === "mixed" ? <Badge variant="secondary">Some NSFW</Badge> : null}
      {pkg.supported ? null : <Badge variant="outline">Unsupported</Badge>}
      <span className="[overflow-wrap:anywhere]">{originLabel(pkg)}</span>
    </p>
  );
}

/** Install, update or uninstall, or the progress of one under way. */
export function PackageActions({
  pkg,
  tasks,
  originId,
}: {
  pkg: Package;
  tasks: PackageTasks;
  /** The offer to install from; the plugin picks one without it. */
  originId?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const open = tasks.openTask(pkg);
  if (open || tasks.sending(pkg)) return <TaskProgress pkg={pkg} task={open} />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pkg.installed ? (
        <>
          {pkg.update_available ? (
            <Button size="sm" disabled={!pkg.supported} onClick={() => tasks.run(pkg, "update")}>
              Update
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Uninstall
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={!pkg.supported}
          aria-label={`Install ${pkg.name}`}
          onClick={() => tasks.run(pkg, "install", originId)}
        >
          Install
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {pkg.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its sources stop being used. Works keep the chapters they had from them and take copies from other
              sources; installing it again brings them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => tasks.run(pkg, "uninstall")}>Uninstall</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaskProgress({ pkg, task }: { pkg: Package; task: ReturnType<PackageTasks["openTask"]> }) {
  // A task started elsewhere (another tab, before a reload): ask the server what it does.
  const details = $api.useQuery(
    "get",
    "/tasks/{task_id}",
    { params: { path: { task_id: task?.taskId ?? "" } } },
    { enabled: !!task && !task.action },
  );
  const action = task?.action ?? (details.data?.payload.action as keyof typeof ACTION_LABELS | undefined) ?? undefined;
  const progress = task?.event?.progress;
  const label = action ? ACTION_LABELS[action].doing : "Working";
  const state = task?.event?.state === "running" ? "" : " (queued)";
  // A store that couldn't be reached is retried: the task waits again, with why.
  const retrying = task?.event?.state === "queued" && task.event.last_error;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>
        {label} {pkg.name}…{task?.event ? state : ""}
        {progress?.total ? ` ${progress.done ?? 0}/${progress.total}` : ""}
        {retrying ? <span className="block text-xs [overflow-wrap:anywhere]">Retrying: {retrying}</span> : null}
      </span>
    </p>
  );
}
