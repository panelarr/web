// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { ProfilesPanel, ProxiesPanel, SolversPanel } from "./network-panels";
import { ProfilePicker } from "./profile-picker";

type SourceNetwork = components["schemas"]["SourceNetwork"];

/**
 * A plugin's network: the profile for the whole plugin, then each extension's and each
 * source's (the most specific wins), each showing what's in effect and whether it arrived.
 */
export function PluginNetwork({ pluginId, pluginName }: { pluginId: string; pluginName: string }) {
  const network = $api.useQuery("get", "/plugins/{plugin_id}/network", {
    params: { path: { plugin_id: pluginId } },
  });
  // Extension names for the groups.
  const sources = $api.useQuery("get", "/sources", { params: { query: { all: true, plugin_id: pluginId } } });
  if (network.error) return <ErrorAlert error={network.error} onRetry={() => void network.refetch()} />;
  if (network.isPending) return <Loading />;
  const data = network.data;
  const accepted = data.accepts_profiles;
  const shown = data.sources.filter((s) => s.present !== false);
  const packageName = (id: string) => sources.data?.sources.find((s) => s.package_id === id)?.package_name ?? id;
  const groups = new Map<string, SourceNetwork[]>();
  for (const source of shown) {
    const key = source.package_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const pick = (source: SourceNetwork) => (
    <li
      key={source.source_id}
      className="grid gap-1.5 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start"
    >
      <p className="flex flex-wrap items-center gap-2 pt-1.5 text-sm font-medium [overflow-wrap:anywhere]">
        {source.name}
        {source.lang ? (
          <Badge variant="outline" className="uppercase">
            {source.lang}
          </Badge>
        ) : null}
      </p>
      <ProfilePicker
        compact
        target={{
          kind: "source",
          id: source.source_id,
          owner: { kind: "source", id: source.source_id },
          label: source.name,
        }}
        assignment={source.assignment}
        effective={source.effective}
        push={source.push}
        accepted={accepted}
        acceptsSolver={data.accepts_solver}
      />
    </li>
  );
  return (
    <div className="grid gap-6">
      <section className="grid gap-2 rounded-xl border bg-card p-4" aria-label="The whole plugin">
        <ProfilePicker
          target={{ kind: "plugin", id: pluginId, owner: { kind: "plugin", id: pluginId }, label: pluginName }}
          assignment={data.assignment}
          accepted={accepted}
          acceptsSolver={data.accepts_solver}
        />
        <p className="text-xs text-muted-foreground">
          For all its sources, unless an extension or a source has its own below.
        </p>
      </section>
      {shown.length === 0 ? (
        <EmptyState title="No sources">Its sources show here once it lists some.</EmptyState>
      ) : (
        [...groups].map(([pkg, list]) =>
          pkg ? (
            <section key={pkg} className="grid gap-2" aria-label={`Extension ${packageName(pkg)}`}>
              <div className="grid gap-1.5 rounded-xl border bg-card p-4">
                <ProfilePicker
                  target={{
                    kind: "package",
                    id: `${pluginId}:${pkg}`,
                    owner: { kind: "package", id: `${pluginId}:${pkg}` },
                    label: `the extension ${packageName(pkg)}`,
                  }}
                  assignment={data.packages.find((a) => a.target_id === `${pluginId}:${pkg}`)}
                  accepted={accepted}
                  acceptsSolver={data.accepts_solver}
                />
                <ul className="-mx-4 mt-2 divide-y border-t">{list.map(pick)}</ul>
              </div>
            </section>
          ) : (
            <section key="sources" className="grid gap-2" aria-label="Sources">
              <h3 className="text-sm font-medium">Sources</h3>
              <ul className="divide-y rounded-xl border bg-card">{list.map(pick)}</ul>
            </section>
          ),
        )
      )}
      {accepted ? (
        <section className="grid gap-4 border-t pt-6" aria-label="Only for this plugin">
          <div>
            <h3 className="text-base font-semibold">Only for {pluginName}</h3>
            <p className="text-sm text-muted-foreground">
              Its own proxies, solvers and profiles, as in its own admin: offered to it, its extensions and its sources,
              and nowhere else. Shared ones are on{" "}
              <Link to="/admin/network" className="underline underline-offset-4">
                Admin → Network
              </Link>
              .
            </p>
          </div>
          <ProfilesPanel scope={{ owner: { kind: "plugin", id: pluginId } }} />
          <ProxiesPanel scope={{ owner: { kind: "plugin", id: pluginId } }} />
          {data.accepts_solver ? <SolversPanel scope={{ owner: { kind: "plugin", id: pluginId } }} /> : null}
        </section>
      ) : null}
    </div>
  );
}
