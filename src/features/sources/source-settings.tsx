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

/** Sources a plugin lets an admin set up (e.g. an extension's own preferences). */
export const hasSettings = (source: { capabilities: readonly string[] }) => source.capabilities.includes("settings");

/**
 * A source's own settings, from its plugin's schema: read live, and only what changed (or was
 * sent) is changed. Secrets are never shown; left empty, they keep their value.
 */
export function SourceSettingsButton({
  source,
  variant = "icon",
}: {
  source: { id: string; name: string };
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
          Settings
        </Button>
      )}
      {open ? <SourceSettingsDialog source={source} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SourceSettingsDialog({ source, onClose }: { source: { id: string; name: string }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const options = $api.queryOptions("get", "/sources/{source_id}/settings", {
    params: { path: { source_id: source.id } },
  });
  const settings = $api.useQuery("get", "/sources/{source_id}/settings", {
    params: { path: { source_id: source.id } },
  });
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
          <DialogDescription>The source's own settings, kept by its plugin.</DialogDescription>
        </DialogHeader>
        {settings.error ? <ErrorAlert error={settings.error} onRetry={() => void settings.refetch()} /> : null}
        {settings.isPending ? <Loading /> : null}
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
