// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { formValues, TextField } from "@/components/form";
import { type JsonSchema, SchemaForm } from "@/components/schema-form";
import { ScrollStrip } from "@/components/scroll-strip";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthBadge } from "@/features/admin/health-badge";
import { ExtensionsPanel, type ExtensionsSearch } from "@/features/extensions/extensions-panel";
import { type JobsSearch, JobsSection, jobsSearch } from "@/features/jobs/jobs-views";
import { pluginJobs } from "@/features/jobs/service";
import { JobsContext, type JobsHost } from "@/features/jobs/use-jobs";
import { PluginNetwork } from "@/features/network/plugin-network";
import { formatRelative } from "@/lib/format";
import { formatVersion } from "@/lib/version";

type Plugin = components["schemas"]["Plugin"];

/** The plugin page's sections beyond its overview; each shows when the plugin supports it. */
const TABS = ["extensions", "jobs", "network"] as const;
type PluginTab = (typeof TABS)[number];

interface PluginSearch extends ExtensionsSearch, JobsSearch {
  tab?: PluginTab;
}

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export const Route = createFileRoute("/_app/admin/plugins/$pluginId")({
  validateSearch: (search: Record<string, unknown>): PluginSearch => {
    const out: PluginSearch = {};
    if (TABS.includes(search.tab as PluginTab)) out.tab = search.tab as PluginTab;
    for (const key of ["q", "lang", "pkg"] as const) {
      const value = str(search[key]);
      if (value) out[key] = value;
    }
    if (search.show === "installed" || search.show === "updates") out.show = search.show;
    if (out.tab === "jobs") Object.assign(out, jobsSearch(search));
    return out;
  },
  component: PluginPage,
});

function PluginPage() {
  const { pluginId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
          <Tabs
            value={search.tab ?? "overview"}
            onValueChange={(value) =>
              void navigate({ search: value === "overview" ? {} : { tab: value as PluginTab }, replace: true })
            }
          >
            <ScrollStrip>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {/* A plugin that hosts many sites (e.g. via extensions) manages them here. */}
                {plugin.data.capabilities.includes("packages") ? (
                  <TabsTrigger value="extensions">Extensions</TabsTrigger>
                ) : null}
                {plugin.data.capabilities.includes("jobs") ? <TabsTrigger value="jobs">Jobs</TabsTrigger> : null}
                <TabsTrigger value="network">Network</TabsTrigger>
              </TabsList>
            </ScrollStrip>
            <TabsContent value="overview" className="mt-4">
              <Overview plugin={plugin.data} />
            </TabsContent>
            {plugin.data.capabilities.includes("packages") ? (
              <TabsContent value="extensions" className="mt-4">
                <ExtensionsPanel
                  pluginId={plugin.data.id}
                  search={search}
                  onSearch={(change) => void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })}
                />
              </TabsContent>
            ) : null}
            {plugin.data.capabilities.includes("jobs") ? (
              <TabsContent value="jobs" className="mt-4">
                <JobsContext value={pluginJobsHost(plugin.data)}>
                  <JobsSection
                    search={search}
                    onStatus={(status) => void navigate({ search: (prev) => ({ ...prev, status }), replace: true })}
                  />
                </JobsContext>
              </TabsContent>
            ) : null}
            <TabsContent value="network" className="mt-4">
              <PluginNetwork pluginId={plugin.data.id} pluginName={plugin.data.name} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </>
  );
}

/** A plugin's jobs, inside its page's Jobs tab (?tab=jobs&job=…&run=…). */
function pluginJobsHost(plugin: Plugin): JobsHost {
  const to = "/admin/plugins/$pluginId";
  const params = { pluginId: plugin.id };
  return {
    service: pluginJobs(plugin.id, plugin.name),
    nested: true,
    links: {
      list: { to, params, search: { tab: "jobs" } },
      job: (job) => ({ to, params, search: { tab: "jobs", job } }),
      run: (job, run) => ({ to, params, search: { tab: "jobs", job, run } }),
    },
  };
}

function Overview({ plugin }: { plugin: Plugin }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ConnectionCard plugin={plugin} />
      {plugin.has_config ? <SettingsCard plugin={plugin} /> : null}
    </div>
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
      // The plugin's own languages decide which packages' sources are available: its package
      // list loads again when next shown.
      void queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/plugins/{plugin_id}/packages", {
          params: { path: { plugin_id: plugin.id } },
        }).queryKey,
        refetchType: "none",
      });
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
