// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Puzzle } from "lucide-react";
import { useRef } from "react";
import { $api } from "@/api/client";
import { formValues, TextField } from "@/components/form";
import { ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVersion } from "@/lib/version";

/** Registers source plugins running as services, and lists the ones registered. */
export function PluginsPanel() {
  const plugins = $api.useQuery("get", "/plugins");

  return (
    <div className="grid gap-6">
      {plugins.error ? <ErrorAlert error={plugins.error} onRetry={() => void plugins.refetch()} /> : null}
      {plugins.isPending ? <Loading /> : null}
      {plugins.data && plugins.data.plugins.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {plugins.data.plugins.map((plugin) => (
            <li key={plugin.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium [overflow-wrap:anywhere]">{plugin.name}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {plugin.id} · {plugin.url} · {formatVersion(plugin.version)}
                </p>
              </div>
              <Badge variant={plugin.health === "ok" ? "secondary" : "destructive"}>{plugin.health}</Badge>
              <span className="text-muted-foreground tabular-nums">
                {plugin.source_count} {plugin.source_count === 1 ? "source" : "sources"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <RegisterPluginForm />
    </div>
  );
}

/** Adds a source plugin running as a service: checked by the server before it is saved. */
export function RegisterPluginForm({ onAdded }: { onAdded?: () => void }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const register = $api.useMutation("post", "/plugins", {
    onSuccess: () => {
      formRef.current?.reset();
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/plugins").queryKey });
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/sources").queryKey.slice(0, 2) });
      onAdded?.();
    },
  });
  return (
    <form
      ref={formRef}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const { url = "", id = "", api_key = "" } = formValues(event.currentTarget);
        register.mutate({ body: { url, ...(id ? { id } : {}), ...(api_key ? { api_key } : {}) } });
      }}
    >
      {register.error ? <ErrorAlert error={register.error} title="Not added" /> : null}
      <TextField
        label="Plugin URL"
        name="url"
        type="url"
        required
        placeholder="http://source-plugin:8904"
        error={register.error}
        autoCapitalize="none"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="ID"
          name="id"
          pattern="[a-z0-9][a-z0-9_\-]{0,39}"
          hint="Optional. Names this plugin and prefixes its sources' IDs."
          error={register.error}
          autoCapitalize="none"
        />
        <TextField
          label="API key"
          name="api_key"
          type="password"
          autoComplete="off"
          hint="Optional, if the plugin needs one."
          error={register.error}
        />
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Add plugin
        </Button>
      </div>
    </form>
  );
}
