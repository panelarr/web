// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type Owner, type Profile, ProfileDialog, useNetworkRefresh } from "./network-dialogs";
import { usable, useProfiles, useProxies, useSolvers } from "./network-panels";

type S = components["schemas"];
type TargetKind = S["NetworkAssignment"]["target_kind"];

/** Where a profile is chosen: a plugin, an extension, a source, the metadata service or a provider. */
export interface PickerTarget {
  kind: TargetKind;
  /** None for the metadata service as a whole. */
  id?: string;
  /** Custom profiles made here belong to it. */
  owner?: Owner;
  /** "this plugin", "this source"…, for labels. */
  label: string;
}

const LEVELS: Record<S["NetworkEffective"]["level"], string> = {
  source: "this source",
  package: "its extension",
  plugin: "its plugin",
  global: "the profile for everything",
  provider: "this provider",
  meta: "the metadata service",
  none: "",
};

/** What's in effect, in words: which profile, chosen where. */
export function effectiveText(effective: S["NetworkEffective"], profiles: readonly Profile[]): string {
  if (effective.level === "none") return "its own settings (nothing chosen).";
  const where = LEVELS[effective.level];
  if (effective.plugin_default) return `Its own settings (chosen on ${where}).`;
  const name = profiles.find((p) => p.id === effective.profile_id)?.name ?? effective.profile_id;
  return `${name} (from ${where}).`;
}

const PUSH: Record<S["NetworkPush"]["state"], { label: string; tone: string } | undefined> = {
  pushed: { label: "In use", tone: "border-success/40 text-success" },
  pending: { label: "On its way", tone: "border-info/40 text-info" },
  failed: { label: "Not applied", tone: "border-destructive/40 text-destructive" },
  not_needed: undefined,
  not_accepted: undefined,
};

/** Whether the plugin has taken the change yet. */
export function PushBadge({ push }: { push: S["NetworkPush"] | undefined }) {
  const shown = push ? PUSH[push.state] : undefined;
  if (!push || !shown) return null;
  return (
    <Badge
      variant="outline"
      className={shown.tone}
      title={
        push.state === "failed" ? push.error : push.pushed_at ? `Applied ${formatRelative(push.pushed_at)}` : undefined
      }
    >
      {shown.label}
    </Badge>
  );
}

/**
 * Chooses the network profile at one level: inherit (the broader levels decide), the plugin's
 * own settings, a shared profile, or a custom one made right here for this target only.
 */
export function ProfilePicker({
  target,
  assignment,
  effective,
  push,
  accepted = true,
  acceptsSolver = true,
  compact = false,
}: {
  target: PickerTarget;
  assignment: S["NetworkAssignment"] | undefined;
  effective?: S["NetworkEffective"] | undefined;
  push?: S["NetworkPush"] | undefined;
  /** The plugin takes network profiles at all. */
  accepted?: boolean;
  /** The plugin can use a solver. */
  acceptsSolver?: boolean;
  /** One line, for a row in a list of sources. */
  compact?: boolean;
}) {
  const id = useId();
  const refresh = useNetworkRefresh();
  const shared = useProfiles({ custom: false });
  const custom = useProfiles(target.owner ? { owner: target.owner } : { custom: false });
  const solvers = useSolvers({ custom: true });
  const proxies = useProxies({ custom: true });
  const [editing, setEditing] = useState<Profile | "new">();
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const set = $api.useMutation("put", "/network/assignments", { onSuccess: refresh, onError });
  const clear = $api.useMutation("delete", "/network/assignments", { onSuccess: refresh, onError });

  const own = target.owner ? (custom.data?.profiles ?? []) : [];
  const all = [...(shared.data?.profiles ?? []), ...own];
  const value = !assignment ? "" : assignment.plugin_default ? "plugin_default" : `profile:${assignment.profile_id}`;
  const chosen = all.find((p) => p.id === assignment?.profile_id);
  const where = { target_kind: target.kind, ...(target.id ? { target_id: target.id } : {}) };
  const choose = (next: string) => {
    if (next === "") return clear.mutate({ params: { query: where } });
    set.mutate({
      body: next === "plugin_default" ? { ...where, plugin_default: true } : { ...where, profile_id: next.slice(8) },
    });
  };

  return (
    <div className={cn("grid gap-1.5", compact && "gap-1")}>
      {compact ? null : (
        <label htmlFor={id} className="text-sm font-medium">
          Network profile for {target.label}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <NativeSelect
            id={id}
            aria-label={compact ? `Network profile for ${target.label}` : undefined}
            value={value}
            disabled={!accepted || set.isPending || clear.isPending}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">{target.kind === "global" ? "None" : "As chosen above (inherit)"}</option>
            <option value="plugin_default">Its own settings</option>
            {(shared.data?.profiles ?? []).length > 0 ? (
              <optgroup label="Shared">
                {shared.data?.profiles.map((p) => (
                  <option key={p.id} value={`profile:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {own.length > 0 ? (
              <optgroup label={`Only for ${target.label}`}>
                {own.map((p) => (
                  <option key={p.id} value={`profile:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
        </div>
        {accepted && target.owner ? (
          <>
            {chosen?.owner ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${chosen.name}`}
                title="Edit this custom profile"
                onClick={() => setEditing(chosen)}
              >
                <Pencil aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="outline"
              size={compact ? "icon" : "sm"}
              aria-label={compact ? `New custom profile for ${target.label}` : undefined}
              onClick={() => setEditing("new")}
            >
              <Plus aria-hidden />
              {compact ? null : "New custom profile"}
            </Button>
          </>
        ) : null}
      </div>
      {!accepted ? (
        <p className="text-xs text-muted-foreground">
          This plugin doesn't take network profiles: it uses its own settings.
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {effective ? <span>In effect: {effectiveText(effective, all)}</span> : null}
          <PushBadge push={push} />
          {!acceptsSolver && (chosen?.solver_id || all.find((p) => p.id === effective?.profile_id)?.solver_id) ? (
            <span>This plugin can't use a solver: the profile's is left out.</span>
          ) : null}
          {compact ? null : (
            <Link to="/admin/network" className="underline-offset-4 hover:underline">
              Manage shared profiles
            </Link>
          )}
        </p>
      )}
      {editing && target.owner ? (
        <ProfileDialog
          {...(editing === "new" ? {} : { profile: editing })}
          owner={target.owner}
          solvers={usable(solvers.data?.solvers ?? [], target.owner)}
          proxies={usable(proxies.data?.proxies ?? [], target.owner)}
          onClose={() => setEditing(undefined)}
          // Made here: chosen here.
          onCreated={(profile) => set.mutate({ body: { ...where, profile_id: profile.id } })}
        />
      ) : null}
    </div>
  );
}
