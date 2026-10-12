// SPDX-License-Identifier: GPL-3.0-or-later

import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { ErrorAlert, Loading } from "@/components/states";
import { ProfilePicker } from "./profile-picker";

const APPLIED: Record<string, string> = {
  meta: "the metadata service's own choice",
  meta_default: "its own settings",
  none: "a direct connection",
};

/**
 * The metadata service's network: one profile for all its providers, or one per provider (a
 * custom one made right here if needed). Panelarr hands it over; the service passes it on.
 */
export function MetaNetwork() {
  const network = $api.useQuery("get", "/system/meta/network");
  if (isApiError(network.error, "meta_unavailable")) {
    return <p className="text-sm text-muted-foreground">Connect the metadata service to choose its network.</p>;
  }
  if (network.error) return <ErrorAlert error={network.error} onRetry={() => void network.refetch()} />;
  if (network.isPending) return <Loading />;
  return (
    <div className="grid gap-4">
      <ProfilePicker target={{ kind: "meta", label: "every provider" }} assignment={network.data.assignment} />
      {network.data.providers.length > 0 ? (
        <ul className="grid gap-3" aria-label="Providers">
          {network.data.providers.map((provider) => (
            <li key={provider.provider_id} className="grid gap-1.5 rounded-lg border p-3">
              <ProfilePicker
                target={{
                  kind: "provider",
                  id: provider.provider_id,
                  owner: { kind: "provider", id: provider.provider_id },
                  label: provider.provider_id,
                }}
                assignment={provider.assignment}
                effective={provider.effective}
                push={provider.push}
                accepted={provider.accepts_profiles}
              />
              <p className="text-xs text-muted-foreground">
                It uses:{" "}
                {provider.applied.origin === "pushed"
                  ? (provider.applied.profile_name ?? "the profile chosen here")
                  : (APPLIED[provider.applied.origin] ?? provider.applied.origin)}
                .
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
