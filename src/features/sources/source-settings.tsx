// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { type JsonSchema, SchemaForm } from "@/components/schema-form";
import { ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfilePicker } from "@/features/network/profile-picker";

/** Sources a plugin lets an admin set up (e.g. an extension's own preferences). */
export const hasSettings = (source: { capabilities: readonly string[] }) => source.capabilities.includes("settings");

/**
 * A source's network profile, and its own settings from its plugin's schema (read live; only
 * what was sent changes). Secrets are never shown; left empty, they keep their value.
 */
export function SourceSettingsButton({
  source,
  settings,
  variant = "icon",
}: {
  source: { id: string; name: string };
  /** The source has settings of its own (besides its network). */
  settings: boolean;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Settings for ${source.name}`}
          title="Settings"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <Settings2 aria-hidden />
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings2 aria-hidden />
          Settings and network
        </Button>
      )}
      {open ? <SourceSettingsDialog source={source} settings={settings} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SourceSettingsDialog({
  source,
  settings: own,
  onClose,
}: {
  source: { id: string; name: string };
  settings: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const options = $api.queryOptions("get", "/sources/{source_id}/settings", {
    params: { path: { source_id: source.id } },
  });
  const settings = $api.useQuery(
    "get",
    "/sources/{source_id}/settings",
    { params: { path: { source_id: source.id } } },
    { enabled: own },
  );
  const save = $api.useMutation("patch", "/sources/{source_id}/settings", {
    onSuccess: (saved) => {
      queryClient.setQueryData(options.queryKey, saved);
      toast.success(`Settings for ${source.name} saved.`);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source.name}</DialogTitle>
          <DialogDescription>Its network, and its own settings kept by its plugin.</DialogDescription>
        </DialogHeader>
        <SourceNetworkSection source={source} />
        {own ? <h3 className="border-t pt-4 text-sm font-medium">Its own settings</h3> : null}
        {settings.error ? <ErrorAlert error={settings.error} onRetry={() => void settings.refetch()} /> : null}
        {own && settings.isPending ? <Loading /> : null}
        {settings.data ? (
          Object.keys((settings.data.schema as JsonSchema).properties ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">This source has nothing to set.</p>
          ) : (
            <SchemaForm
              key={settings.dataUpdatedAt}
              schema={settings.data.schema as JsonSchema}
              values={settings.data.values}
              pending={save.isPending}
              error={save.error}
              submitLabel="Save settings"
              onSubmit={(values) => save.mutate({ params: { path: { source_id: source.id } }, body: { values } })}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const APPLIED: Record<string, string> = {
  plugin: "its own settings",
  none: "a direct connection",
  unknown: "it can't say",
};

/** The source's profile, and what its plugin says it actually uses (asked live). */
function SourceNetworkSection({ source }: { source: { id: string; name: string } }) {
  const network = $api.useQuery("get", "/sources/{source_id}/network", {
    params: { path: { source_id: source.id } },
  });
  if (network.error) return <ErrorAlert error={network.error} onRetry={() => void network.refetch()} />;
  if (network.isPending) return <Loading label="Asking its plugin…" />;
  const view = network.data;
  const accepted = view.push?.state !== "not_accepted";
  return (
    <section className="grid gap-2" aria-label="Network">
      <ProfilePicker
        target={{ kind: "source", id: source.id, owner: { kind: "source", id: source.id }, label: "this source" }}
        assignment={view.assignment}
        effective={view.effective}
        push={view.push}
        accepted={accepted}
      />
      {view.applied ? (
        <p className="text-xs text-muted-foreground">
          Its plugin says it uses:{" "}
          {view.applied.origin === "pushed"
            ? (view.applied.profile_name ?? "the profile chosen here")
            : (APPLIED[view.applied.origin] ?? view.applied.origin)}
          .
        </p>
      ) : null}
    </section>
  );
}
