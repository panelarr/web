// SPDX-License-Identifier: GPL-3.0-or-later

// The metadata service as the server passes it on: its providers, their sync runs (which move
// on over time, without events, as meta's do) and its health.
import type { components } from "@/api/schema.gen";

type S = components["schemas"];

export interface MetaState {
  meta: S["MetaConnection"];
  metaSyncRuns: S["MetaSyncRun"][];
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const finished = (
  id: string,
  kind: string,
  status: S["MetaSyncRun"]["status"],
  ago: number,
  minutes: number,
  counts: Partial<S["MetaSyncRun"]>,
  extra: Partial<S["MetaSyncRun"]> = {},
): S["MetaSyncRun"] => ({
  id,
  provider: "example-provider",
  kind,
  status,
  trigger: "schedule",
  started_at: hoursAgo(ago),
  finished_at: new Date(Date.parse(hoursAgo(ago)) + minutes * 60_000).toISOString(),
  upserts: 0,
  changed: 0,
  removals: 0,
  merges: 0,
  skipped: 0,
  marked_removed: 0,
  notices: [],
  ...counts,
  ...extra,
});

export function initialMetaSyncRuns(): S["MetaSyncRun"][] {
  return [
    finished(
      "sr-104",
      "delta",
      "succeeded",
      0.4,
      1,
      { upserts: 312, changed: 41, merges: 4 },
      {
        cursor_start: "2026-10-12T09:00:00Z",
        cursor_end: "2026-10-12T10:00:00Z",
      },
    ),
    finished(
      "sr-103",
      "delta",
      "failed",
      1.4,
      0,
      { upserts: 0 },
      {
        error: "The provider answered 429 Too Many Requests",
        notices: [{ level: "warn", message: "Rate limited; retrying in an hour", at: hoursAgo(1.4) }],
      },
    ),
    finished(
      "sr-102",
      "dump",
      "succeeded",
      96,
      42,
      {
        upserts: 48_210,
        changed: 1_877,
        removals: 12,
        merges: 1_022,
        skipped: 3,
        marked_removed: 9,
      },
      {
        snapshot_id: "2026-10-08",
        notices: [
          { level: "info", message: "3 records without a title were skipped", at: hoursAgo(95.5) },
          {
            level: "warn",
            message: "9 records were gone from the snapshot",
            ref: "snapshot 2026-10-08",
            at: hoursAgo(95.4),
          },
        ],
      },
    ),
  ];
}

const SYNC_STEPS = 5;

/** Starts a sync run, as meta does when asked. */
export function startMetaSync(state: MetaState, provider: string, kind: string, id: string): S["MetaSyncRun"] {
  const run: S["MetaSyncRun"] = {
    id,
    provider,
    kind,
    status: "running",
    trigger: "manual",
    started_at: new Date().toISOString(),
    upserts: 0,
    changed: 0,
    removals: 0,
    merges: 0,
    skipped: 0,
    marked_removed: 0,
    notices: [],
    progress: { step: "0", of: String(SYNC_STEPS) },
  };
  state.metaSyncRuns.unshift(run);
  return run;
}

/** Moves every running sync on one step (the browser calls it on a timer; tests by hand). */
export function tickMetaSyncs(state: MetaState): boolean {
  let changed = false;
  for (const run of state.metaSyncRuns.filter((r) => r.status === "running")) {
    changed = true;
    const step = Number(run.progress?.step ?? 0) + 1;
    run.upserts += run.kind === "dump" ? 9_000 : 60;
    if (step >= SYNC_STEPS) {
      run.status = "succeeded";
      run.finished_at = new Date().toISOString();
      run.changed = Math.round(run.upserts / 10);
      delete run.progress;
    } else {
      run.progress = { step: String(step), of: String(SYNC_STEPS) };
    }
  }
  return changed;
}

/** Each provider in full: its plugin, schedules from meta's configuration, last runs. */
export function providerDetails(state: MetaState): S["MetaProviderDetail"][] {
  return state.meta.check.providers.map((p) => ({
    id: p.id,
    mode: "service",
    plugin_id: p.id,
    plugin_name: "Example Provider",
    plugin_version: "1.2.0",
    health: p.health as S["MetaProviderDetail"]["health"],
    ...(p.message ? { health_message: p.message } : {}),
    schedules: { dump: "0 3 * * *", delta: "0 * * * *" },
    record_count: p.records,
    last_runs: state.metaSyncRuns.filter((r) => r.provider === p.id).slice(0, 3),
  }));
}

/** meta's own health: its database, its search backend and each provider's plugin. */
export function metaHealth(state: MetaState): S["MetaServiceHealth"] {
  const providers = state.meta.check.providers.map((p): S["MetaComponentHealth"] => ({
    name: `provider:${p.id}`,
    kind: "provider",
    status: p.health as S["MetaComponentHealth"]["status"],
    latency_ms: 38,
    checked_at: new Date().toISOString(),
    details: { records: String(p.records), mode: "service" },
  }));
  return {
    status: "degraded",
    version: "0.9.0",
    components: [
      {
        name: "database",
        kind: "database",
        status: "ok",
        latency_ms: 2,
        checked_at: new Date().toISOString(),
        details: { entries: "48210" },
      },
      {
        name: "search",
        kind: "search",
        status: "degraded",
        message: "The index is 1 022 entries behind; a rebuild is under way.",
        latency_ms: 14,
        checked_at: new Date().toISOString(),
        details: { backend: "external", indexed: "47188" },
      },
      ...providers,
    ],
  };
}

/** meta's search engine as configured: an external engine, a little behind. */
export function initialSearchEngine(): S["MetaSearchEngine"] {
  return {
    settings: {
      backend: "meilisearch",
      url: "http://search:7700",
      has_api_key: true,
      index_prefix: "meta_",
      browse: "facets",
      origin: "config",
    },
    status: {
      backend: "meilisearch",
      typo_tolerance: true,
      substring: false,
      facets: true,
      ready: true,
      reachable: true,
      degraded: false,
      index: "meta_entries",
      documents: 47_188,
      built_at: hoursAgo(50),
      pending: 1_022,
      lag_seconds: 340,
      applied: 120_400,
    },
  };
}

/** Whether meta could use these settings: an engine needs a URL; "wrong" is a rejected key. */
export function searchEngineTest(settings: S["SearchEngineSettings"]): S["SearchEngineTest"] {
  if (settings.backend !== "postgres" && !settings.url) return { ok: false, error: "An engine needs its URL." };
  if (settings.api_key === "wrong") return { ok: false, error: "The engine answered 401: the key was rejected." };
  return { ok: true };
}

/** Saves settings over the configuration; the engine answering changes with them. */
export function saveSearchEngine(engine: S["MetaSearchEngine"], settings: S["SearchEngineSettings"]): void {
  const postgres = settings.backend === "postgres";
  engine.settings = {
    backend: settings.backend,
    ...(!postgres && settings.url ? { url: settings.url } : {}),
    has_api_key: !postgres && (Boolean(settings.api_key) || engine.settings.has_api_key),
    ...(settings.index_prefix ? { index_prefix: settings.index_prefix } : {}),
    ...(settings.browse ? { browse: settings.browse } : {}),
    origin: "admin",
  };
  engine.status = {
    ...engine.status,
    backend: settings.backend,
    typo_tolerance: !postgres,
    substring: postgres,
    ...(postgres ? { index: undefined } : { index: `${settings.index_prefix ?? ""}entries` }),
  };
}

/** A rebuild of the index has finished: everything is in it. */
export function searchRebuilt(engine: S["MetaSearchEngine"]): void {
  engine.status = {
    ...engine.status,
    documents: 48_210,
    built_at: new Date().toISOString(),
    pending: 0,
    lag_seconds: 0,
  };
}
