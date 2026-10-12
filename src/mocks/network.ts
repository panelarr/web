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
