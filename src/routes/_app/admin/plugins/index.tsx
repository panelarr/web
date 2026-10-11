// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Puzzle, RefreshCw, Settings2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HealthBadge } from "@/features/admin/health-badge";
import { RegisterPluginForm } from "@/features/setup/plugins-panel";
import { formatRelative } from "@/lib/format";

type Plugin = components["schemas"]["Plugin"];

export const Route = createFileRoute("/_app/admin/plugins/")({
  component: PluginsPage,
});

function usePluginInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/plugins").queryKey });
    // Every /sources query, whatever its filters.
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "/sources" });
  };
}

function PluginsPage() {
  const plugins = $api.useQuery("get", "/plugins");
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Plugins"
        description="Source plugins run as their own services. Panelarr reaches them over the network."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add plugin
          </Button>
        }
      />
      {plugins.error ? <ErrorAlert error={plugins.error} onRetry={() => void plugins.refetch()} /> : null}
      {plugins.isPending ? <Loading /> : null}
      {plugins.data?.plugins.length === 0 ? (
        <EmptyState icon={<Puzzle />} title="No plugins yet">
          Add a source plugin to read and download chapters.
        </EmptyState>
      ) : null}
      <div className="grid gap-4">
        {plugins.data?.plugins.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} />
        ))}
      </div>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a plugin</DialogTitle>
            <DialogDescription>The server checks that the plugin answers before saving it.</DialogDescription>
          </DialogHeader>
          <RegisterPluginForm onAdded={() => setAdding(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const invalidate = usePluginInvalidation();
  const enabledId = useId();
  const update = $api.useMutation("patch", "/plugins/{plugin_id}", { onSuccess: invalidate });
  const sync = $api.useMutation("post", "/plugins/{plugin_id}/sync", {
    onSuccess: (synced) => {
      invalidate();
      toast.success(`${synced.name}: ${synced.source_count} sources, ${synced.health}.`);
    },
  });
  const remove = $api.useMutation("delete", "/plugins/{plugin_id}", { onSuccess: invalidate });
  const path = { params: { path: { plugin_id: plugin.id } } };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
          {plugin.name}
          <span className="text-sm font-normal text-muted-foreground">v{plugin.version}</span>
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          {plugin.id} · {plugin.url}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Label htmlFor={enabledId} className="text-xs text-muted-foreground">
            {plugin.enabled ? "On" : "Off"}
          </Label>
          <Switch
            id={enabledId}
            aria-label={`${plugin.name} enabled`}
            checked={plugin.enabled}
            disabled={update.isPending}
            onCheckedChange={(enabled) => update.mutate({ ...path, body: { enabled } })}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <HealthBadge status={plugin.health} />
          {plugin.checked_at ? (
            <span className="text-xs text-muted-foreground">checked {formatRelative(plugin.checked_at)}</span>
          ) : null}
          <Link
            to="/admin/sources"
            search={{ plugin: plugin.id }}
            className="text-sm underline-offset-4 hover:underline"
          >
            {plugin.source_count} {plugin.source_count === 1 ? "source" : "sources"}
          </Link>
        </div>
        {plugin.health_message ? (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{plugin.health_message}</p>
        ) : null}
        {plugin.capabilities.length > 0 ? (
          <p className="flex flex-wrap gap-1">
            {plugin.capabilities.map((capability) => (
              <Badge key={capability} variant="outline">
                {capability}
              </Badge>
            ))}
          </p>
        ) : null}
        {update.error ? <ErrorAlert error={update.error} /> : null}
        {sync.error ? <ErrorAlert error={sync.error} title="Sync failed" /> : null}
        {remove.error ? <ErrorAlert error={remove.error} title="Not removed" /> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate(path)}>
            <RefreshCw className={sync.isPending ? "animate-spin" : undefined} aria-hidden />
            Sync now
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/plugins/$pluginId" params={{ pluginId: plugin.id }}>
              <Settings2 aria-hidden />
              {plugin.has_config ? "Settings" : "Connection"}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {plugin.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its {plugin.source_count} sources disappear from Panelarr. Works keep their other sources, and
                  downloaded chapters stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(path)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
