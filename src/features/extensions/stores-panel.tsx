// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { packageListKey } from "./use-package-tasks";

type Origin = components["schemas"]["PackageOrigin"];

/**
 * Where a plugin's packages come from (its stores), each with how its last refresh went, and
 * Refresh now. Stores are added and removed in the plugin's settings.
 */
export function StoresPanel({ pluginId }: { pluginId: string }) {
  const init = { params: { path: { plugin_id: pluginId } } };
  const origins = $api.useQuery("get", "/plugins/{plugin_id}/origins", init);
  // A turned-off plugin is said once, by the extensions below.
  if (isApiError(origins.error, "plugin_disabled")) return null;
  return (
    <section aria-labelledby="stores-heading" className="grid gap-2">
      <h3 id="stores-heading" className="text-sm font-medium">
        Stores
      </h3>
      {origins.error ? <ErrorAlert error={origins.error} onRetry={() => void origins.refetch()} /> : null}
      {origins.data?.origins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stores yet: add one in the plugin's settings.</p>
      ) : null}
      {origins.data && origins.data.origins.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {origins.data.origins.map((origin) => (
            <StoreRow key={origin.id} pluginId={pluginId} origin={origin} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StoreRow({ pluginId, origin }: { pluginId: string; origin: Origin }) {
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions("get", "/plugins/{plugin_id}/origins", {
    params: { path: { plugin_id: pluginId } },
  }).queryKey;
  const refresh = $api.useMutation("post", "/plugins/{plugin_id}/origins/{origin_id}/refresh", {
    onSuccess: (refreshed) => {
      queryClient.setQueryData<components["schemas"]["PackageOriginList"]>(listKey, (old) =>
        old ? { ...old, origins: old.origins.map((o) => (o.id === refreshed.id ? refreshed : o)) } : old,
      );
      // What the store offers may have changed.
      void queryClient.invalidateQueries({ queryKey: packageListKey(pluginId) });
      toast.success(`${refreshed.name}: ${refreshed.package_count} extensions.`);
    },
    // A store that can't be reached or read answers 502: the row says why.
  });
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56 text-sm">
        <p className="font-medium [overflow-wrap:anywhere]">{origin.name}</p>
        {origin.url ? <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{origin.url}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {origin.package_count} extensions
          {origin.refreshed_at ? (
            <>
              {" · refreshed "}
              <time dateTime={origin.refreshed_at} title={formatDateTime(origin.refreshed_at)}>
                {formatRelative(origin.refreshed_at)}
              </time>
            </>
          ) : (
            " · not read yet"
          )}
        </p>
        {origin.signing_key_fingerprint ? (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Signed by <span className="font-mono">{origin.signing_key_fingerprint}</span>
          </p>
        ) : null}
        {refresh.error ? (
          <p role="alert" className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">
            {errorMessage(refresh.error)}
          </p>
        ) : origin.error ? (
          <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">Last refresh failed: {origin.error}</p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={refresh.isPending}
        aria-label={`Refresh ${origin.name} now`}
        onClick={() => refresh.mutate({ params: { path: { plugin_id: pluginId, origin_id: origin.id } } })}
      >
        <RefreshCw className={refresh.isPending ? "animate-spin" : undefined} aria-hidden />
        Refresh now
      </Button>
    </li>
  );
}
