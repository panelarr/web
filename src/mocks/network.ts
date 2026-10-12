// SPDX-License-Identifier: GPL-3.0-or-later

// Shared network services for the mock server: solvers, proxies, network profiles built from
// them, and where profiles are assigned. Nothing is assigned at first, as on a new server.
import type { components } from "@/api/schema.gen";

type S = components["schemas"];

export interface NetworkState {
  solvers: S["Solver"][];
  proxies: S["Proxy"][];
  /** Proxy passwords, kept apart: they're never sent back. */
  proxyPasswords: Record<string, string>;
  profiles: Omit<S["NetworkProfile"], "assigned_to">[];
  assignments: S["NetworkAssignment"][];
}

const at = "2026-10-10T09:00:00Z";

export function initialNetwork(): NetworkState {
  return {
    solvers: [
      {
        id: "solver-main",
        name: "Challenge solver",
        type: "flaresolverr",
        url: "http://solver:8191",
        max_timeout_seconds: 60,
        as_response_fallback: false,
        created_at: at,
        updated_at: at,
      },
    ],
    proxies: [
      {
        id: "vpn-nl",
        name: "VPN (Netherlands)",
        url: "http://vpn-nl:8888",
        has_password: false,
        created_at: at,
        updated_at: at,
      },
      {
        id: "socks-home",
        name: "Home SOCKS",
        url: "socks5://proxy.example.net:1080",
        username: "reader",
        has_password: true,
        created_at: at,
        updated_at: at,
      },
    ],
    proxyPasswords: { "socks-home": "secret" },
    profiles: [
      {
        id: "vpn",
        name: "Through the VPN",
        proxy_id: "vpn-nl",
        solver_id: "solver-main",
        rate_limit: { requests: 30, period_seconds: 60, burst: 5, scope: "source" },
        concurrency: 4,
        user_agent: { mode: "from_solver" },
        headers: {},
        timeouts: { connect_seconds: 10, read_seconds: 30 },
        created_at: at,
        updated_at: at,
      },
    ],
    assignments: [],
  };
}

/** A profile as the API shows it: with where it's assigned. */
export function profileView(state: NetworkState, profile: NetworkState["profiles"][number]): S["NetworkProfile"] {
  return {
    ...profile,
    assigned_to: state.assignments
      .filter((a) => a.profile_id === profile.id)
      .map((a) => ({ target_kind: a.target_kind, target_id: a.target_id })),
  };
}

type Owned = { owner?: S["NetworkProfile"]["owner"] };

/** The shared ones by default; with custom ones too; or only one owner's. */
export function filterOwned<T extends Owned>(items: T[], url: URL): T[] {
  const kind = url.searchParams.get("owner_kind");
  const id = url.searchParams.get("owner_id");
  if (kind && id) return items.filter((item) => item.owner?.kind === kind && item.owner.id === id);
  return url.searchParams.get("include_custom") === "true" ? items : items.filter((item) => !item.owner);
}

/** What a check finds: a host with "down" in it doesn't answer. */
export function networkTest(url: string, what: string): S["NetworkTest"] {
  if (/down|unreachable/.test(url)) {
    return { ok: false, message: `The ${what} at ${url} didn't answer (connection refused).`, latency_ms: 3000 };
  }
  return {
    ok: true,
    message: `The ${what} answered.`,
    ...(what === "solver" ? { version: "3.3.21" } : {}),
    latency_ms: 40 + Math.round(Math.random() * 80),
  };
}

/** Which plugins take network profiles, and solvers in them (from their declared services). */
const ACCEPTS: Record<string, { profiles: boolean; solver: boolean }> = {
  example: { profiles: true, solver: true },
  stores: { profiles: true, solver: false },
};

export const accepts = (pluginId: string) => ACCEPTS[pluginId] ?? { profiles: false, solver: false };

type Target = { kind: S["NetworkAssignment"]["target_kind"]; id: string };

function assigned(state: NetworkState, target: Target): S["NetworkAssignment"] | undefined {
  return state.assignments.find((a) => a.target_kind === target.kind && a.target_id === target.id);
}

/** The most specific assignment along a chain decides; with none, nothing is in effect. */
function resolve(state: NetworkState, chain: Target[]): { effective: S["NetworkEffective"]; at?: string } {
  for (const target of chain) {
    const found = assigned(state, target);
    if (found) {
      return {
        effective: {
          level: target.kind as S["NetworkEffective"]["level"],
          plugin_default: found.plugin_default,
          ...(found.profile_id ? { profile_id: found.profile_id } : {}),
        },
        at: found.updated_at,
      };
    }
  }
  return { effective: { level: "none", plugin_default: false } };
}

/** Changes reach plugins within a second or so: until then they're on their way. */
function push(accepted: boolean, at: string | undefined): S["NetworkPush"] {
  if (!accepted) return { state: "not_accepted" };
  if (!at) return { state: "not_needed" };
  const since = Date.now() - Date.parse(at);
  return since < 1200
    ? { state: "pending" }
    : { state: "pushed", pushed_at: new Date(Date.parse(at) + 1000).toISOString() };
}

export function sourceNetwork(state: NetworkState, source: S["SourceInfo"]): S["SourceNetwork"] {
  const plugin = source.plugin_id;
  const chain: Target[] = [
    { kind: "source", id: source.id },
    ...(source.package_id ? [{ kind: "package" as const, id: `${plugin}:${source.package_id}` }] : []),
    { kind: "plugin", id: plugin },
    { kind: "global", id: "" },
  ];
  const { effective, at } = resolve(state, chain);
  const own = assigned(state, { kind: "source", id: source.id });
  return {
    source_id: source.id,
    name: source.name,
    lang: source.lang,
    ...(source.package_id ? { package_id: source.package_id } : {}),
    present: source.present,
    ...(own ? { assignment: own } : {}),
    effective,
    push: push(accepts(plugin).profiles, at),
  };
}

export function pluginNetwork(state: NetworkState, pluginId: string, sources: S["SourceInfo"][]): S["PluginNetwork"] {
  const own = assigned(state, { kind: "plugin", id: pluginId });
  return {
    plugin_id: pluginId,
    accepts_profiles: accepts(pluginId).profiles,
    accepts_solver: accepts(pluginId).solver,
    ...(own ? { assignment: own } : {}),
    packages: state.assignments.filter((a) => a.target_kind === "package" && a.target_id.startsWith(`${pluginId}:`)),
    sources: sources.filter((s) => s.plugin_id === pluginId).map((s) => sourceNetwork(state, s)),
  };
}

/** What the plugin says it uses for a source (asked live, on a source's own view). */
export function applied(state: NetworkState, view: S["SourceNetwork"]): S["NetworkApplied"] {
  if (view.push?.state === "not_accepted") return { origin: "unknown" };
  if (view.effective.plugin_default || view.effective.level === "none") return { origin: "plugin" };
  const profile = state.profiles.find((p) => p.id === view.effective.profile_id);
  return { origin: "pushed", ...(profile ? { profile_name: profile.name } : {}) };
}

export function metaNetwork(state: NetworkState, providers: string[]): S["MetaNetwork"] {
  const own = assigned(state, { kind: "meta", id: "" });
  return {
    ...(own ? { assignment: own } : {}),
    providers: providers.map((id) => {
      const { effective, at } = resolve(state, [
        { kind: "provider", id },
        { kind: "meta", id: "" },
        { kind: "global", id: "" },
      ]);
      const mine = assigned(state, { kind: "provider", id });
      const profile = state.profiles.find((p) => p.id === effective.profile_id);
      return {
        provider_id: id,
        accepts_profiles: true,
        ...(mine ? { assignment: mine } : {}),
        effective,
        push: push(true, at),
        applied:
          effective.level === "none" || effective.plugin_default
            ? { origin: "meta_default" as const }
            : { origin: "pushed" as const, ...(profile ? { profile_name: profile.name } : {}) },
      };
    }),
  };
}
