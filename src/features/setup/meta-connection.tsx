// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { formValues, TextField } from "@/components/form";
import { ErrorAlert, Loading } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRelative } from "@/lib/format";

type MetaConnection = components["schemas"]["MetaConnection"];

const POLL_MS = 5_000;

/**
 * Connects Panelarr to the metadata service and shows whether it's ready: reachable, the key
 * accepted with the admin scope, and a provider with entries. Explains what to do otherwise,
 * and can start a provider's first sync.
 */
export function MetaConnectionPanel() {
  const queryClient = useQueryClient();
  const metaKey = $api.queryOptions("get", "/system/meta").queryKey;
  const meta = $api.useQuery("get", "/system/meta");
  const [syncing, setSyncing] = useState(false);

  const store = (data: MetaConnection) => {
    queryClient.setQueryData(metaKey, data);
    void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/setup").queryKey });
  };
  const save = $api.useMutation("put", "/system/meta", { onSuccess: store });
  const check = $api.useMutation("post", "/system/meta/check", { onSuccess: store });
  const sync = $api.useMutation("post", "/system/meta/providers/{provider}/sync", {
    onSuccess: () => setSyncing(true),
  });

  const ready = meta.data?.check.ready ?? false;
  const checkNow = check.mutate;
  // While a first sync runs, check every few seconds until entries arrive.
  useEffect(() => {
    if (!syncing || ready) return;
    const timer = setInterval(() => checkNow({}), POLL_MS);
    return () => clearInterval(timer);
  }, [syncing, ready, checkNow]);

  if (meta.error) return <ErrorAlert error={meta.error} onRetry={() => void meta.refetch()} />;
  if (!meta.data) return <Loading />;
  const { check: state, managed_by_env: managed, url } = meta.data;

  return (
    <div className="grid gap-6">
      {managed ? (
        <Alert>
          <AlertTitle>Set by the server's configuration</AlertTitle>
          <AlertDescription>
            The connection to <span className="font-mono [overflow-wrap:anywhere]">{url}</span> comes from
            PANELARR_META_URL and can't be changed here.
          </AlertDescription>
        </Alert>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = formValues(event.currentTarget);
            save.mutate({
              body: { url: values.url ?? "", ...(values.api_key ? { api_key: values.api_key } : {}) },
            });
          }}
        >
          {save.error ? <ErrorAlert error={save.error} title="Not connected" /> : null}
          <TextField
            label="Metadata service URL"
            name="url"
            type="url"
            required
            defaultValue={url ?? ""}
            placeholder="http://meta:8901"
            error={save.error}
            autoCapitalize="none"
          />
          <TextField
            label="Admin API key"
            name="api_key"
            type="password"
            autoComplete="off"
            required={!state.configured}
            error={save.error}
            hint={
              state.configured
                ? "Leave empty to keep the saved key."
                : "A key with the admin scope, from the metadata service's admin."
            }
          />
          <div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {state.configured ? "Save and check" : "Connect"}
            </Button>
          </div>
        </form>
      )}

      {state.configured ? (
        <section aria-labelledby="meta-status" className="grid gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="meta-status" className="font-medium">
              Status
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Checked {formatRelative(state.checked_at)}</span>
              <Button variant="outline" size="sm" onClick={() => check.mutate({})} disabled={check.isPending}>
                <RefreshCw className={check.isPending ? "animate-spin" : undefined} aria-hidden />
                Check again
              </Button>
            </div>
          </div>
          <ul className="grid gap-1.5 text-sm">
            <CheckItem ok={state.reachable} label="Reachable" />
            <CheckItem ok={state.key_valid} label="API key accepted" />
            <CheckItem ok={state.admin_scope} label="The key has the admin scope" />
            <CheckItem ok={state.providers.some((p) => p.records > 0)} label="A metadata provider has entries" />
          </ul>
          {check.error ? <ErrorAlert error={check.error} /> : null}
          {state.problem && !state.ready ? (
            <Alert>
              <AlertTitle>What to do</AlertTitle>
              <AlertDescription className="[overflow-wrap:anywhere]">{state.problem}</AlertDescription>
            </Alert>
          ) : null}
          {state.providers.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {state.providers.map((provider) => (
                <li key={provider.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{provider.id}</span>
                  <Badge variant={provider.health === "ok" ? "secondary" : "destructive"}>{provider.health}</Badge>
                  <span className="text-muted-foreground tabular-nums">{formatNumber(provider.records)} entries</span>
                  {provider.records === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sync.isPending || syncing}
                      onClick={() =>
                        sync.mutate({ params: { path: { provider: provider.id } }, body: { kind: "dump" } })
                      }
                    >
                      {syncing ? <Loader2 className="animate-spin" aria-hidden /> : null}
                      {syncing ? "Syncing…" : "Start sync"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {sync.error ? <ErrorAlert error={sync.error} title="The sync didn't start" /> : null}
          {syncing && !state.ready ? (
            <p className="text-xs text-muted-foreground">
              A first full import can take a while. This page checks every few seconds.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span>{label}</span>
      <span className="sr-only">{ok ? "(yes)" : "(no)"}</span>
    </li>
  );
}
