// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { formValues, TextField } from "@/components/form";
import { type JsonSchema, SchemaForm } from "@/components/schema-form";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { HealthBadge } from "@/features/admin/health-badge";
import { formatRelative } from "@/lib/format";
import { formatVersion } from "@/lib/version";

type Plugin = components["schemas"]["Plugin"];

export const Route = createFileRoute("/_app/admin/plugins/$pluginId")({
  component: PluginPage,
});

function PluginPage() {
  const { pluginId } = Route.useParams();
  const queryClient = useQueryClient();
  const path = { params: { path: { plugin_id: pluginId } } };
  const plugin = $api.useQuery("get", "/plugins/{plugin_id}", path);
  // Settings are applied in the background (a plugin may add stores, say); syncing asks the
  // plugin again, so its health shows how that went.
  const sync = $api.useMutation("post", "/plugins/{plugin_id}/sync", {
    onSuccess: (synced) => {
      queryClient.setQueryData($api.queryOptions("get", "/plugins/{plugin_id}", path).queryKey, synced);
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/plugins").queryKey });
      toast.success(`${synced.name}: ${synced.source_count} sources, ${synced.health}.`);
    },
  });
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link to="/admin/plugins">
          <ArrowLeft aria-hidden />
          Plugins
        </Link>
      </Button>
      {plugin.error ? <ErrorAlert error={plugin.error} onRetry={() => void plugin.refetch()} /> : null}
      {plugin.isPending ? <Loading /> : null}
      {plugin.data ? (
        <>
          <PageHeader
            title={plugin.data.name}
            description={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {plugin.data.id} · {formatVersion(plugin.data.version)}
                </span>
                <HealthBadge status={plugin.data.health} />
                {plugin.data.checked_at ? (
                  <span className="text-xs">checked {formatRelative(plugin.data.checked_at)}</span>
                ) : null}
              </span>
            }
            actions={
              <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(path)}>
                <RefreshCw className={sync.isPending ? "animate-spin" : undefined} aria-hidden />
                Sync now
              </Button>
            }
          />
          {sync.error ? <ErrorAlert error={sync.error} title="Not synced" /> : null}
          {plugin.data.health_message ? (
            <p className="mb-6 text-sm text-muted-foreground [overflow-wrap:anywhere]">{plugin.data.health_message}</p>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ConnectionCard plugin={plugin.data} />
            {plugin.data.has_config ? <SettingsCard plugin={plugin.data} /> : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function ConnectionCard({ plugin }: { plugin: Plugin }) {
  const queryClient = useQueryClient();
  const removeKeyId = useId();
  const [removeKey, setRemoveKey] = useState(false);
  const update = $api.useMutation("patch", "/plugins/{plugin_id}", {
    onSuccess: (updated) => {
      queryClient.setQueryData(
        $api.queryOptions("get", "/plugins/{plugin_id}", { params: { path: { plugin_id: plugin.id } } }).queryKey,
        updated,
      );
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/plugins").queryKey });
      toast.success("Connection saved.");
    },
  });
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>A new address or key is checked before it's saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const { url = "", api_key = "" } = formValues(event.currentTarget);
            update.mutate({
              params: { path: { plugin_id: plugin.id } },
              body: {
                ...(url !== plugin.url ? { url } : {}),
                // An empty key removes it; leaving the field empty keeps it.
                ...(removeKey ? { api_key: "" } : api_key ? { api_key } : {}),
              },
            });
          }}
        >
          {update.error ? <ErrorAlert error={update.error} title="Not saved" /> : null}
          <TextField label="URL" name="url" type="url" required defaultValue={plugin.url} error={update.error} />
          <TextField
            label="API key"
            name="api_key"
            type="password"
            autoComplete="off"
            disabled={removeKey}
            hint="Leave empty to keep the current key."
            error={update.error}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={removeKeyId}
              checked={removeKey}
              onCheckedChange={(checked) => setRemoveKey(checked === true)}
            />
            <Label htmlFor={removeKeyId} className="font-normal">
              Remove the API key
            </Label>
          </div>
          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save connection
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SettingsCard({ plugin }: { plugin: Plugin }) {
  const queryClient = useQueryClient();
  const options = $api.queryOptions("get", "/plugins/{plugin_id}/config", {
    params: { path: { plugin_id: plugin.id } },
  });
  const config = $api.useQuery("get", "/plugins/{plugin_id}/config", { params: { path: { plugin_id: plugin.id } } });
  const save = $api.useMutation("put", "/plugins/{plugin_id}/config", {
    onSuccess: (saved) => {
      queryClient.setQueryData(options.queryKey, saved);
      toast.success("Settings saved.", {
        description: "The plugin applies them in the background; its health here updates when it's done.",
      });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          The plugin checks and applies them. Panelarr keeps them and hands them back after a restart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isApiError(config.error, "no_config") ? (
          <p className="text-sm text-muted-foreground">This plugin has no settings.</p>
        ) : config.error ? (
          <ErrorAlert error={config.error} onRetry={() => void config.refetch()} />
        ) : null}
        {config.isPending ? <Loading /> : null}
        {config.data ? (
          <SchemaForm
            key={config.dataUpdatedAt}
            schema={config.data.schema as JsonSchema}
            values={config.data.values}
            pending={save.isPending}
            error={save.error}
            submitLabel="Save settings"
            onSubmit={(values) => save.mutate({ params: { path: { plugin_id: plugin.id } }, body: { values } })}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
