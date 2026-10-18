// SPDX-License-Identifier: GPL-3.0-or-later

// The mock server's state: a tiny in-memory Panelarr. Scenarios set the starting point:
//
//   ready       set up, signed in as the admin (the default)
//   fresh       a new install: no accounts, nothing connected
//   signed-out  set up, nobody signed in
//   user        set up, signed in as a user without admin rights
//   degraded    set up and signed in, but the metadata service has no entries yet
//   big-store   like ready, with a store of 1,500 extensions
//   slow-pages  like ready, with page images arriving slowly, in any order, of varied heights
//
// In the browser, pick one with `?mock=<scenario>`; it lasts for the tab (sessionStorage).
import type { components } from "@/api/schema.gen";
import {
  adminUser,
  apiKey,
  invite,
  metaConnection,
  plugin,
  pluginConfig,
  readerUser,
  session,
  sourceSettings,
  sources,
  storePlugin,
} from "./data";
import { initialStorages } from "./downloads";
import { initialDuplicates } from "./duplicates";
import type { OwnRetries } from "./image-retries";
import { initialJobs, initialMetaJobs, initialPluginJobs, initialRuns, initialTasks, type JobsState } from "./jobs";
import { initialMetaSyncRuns, initialSearchEngine } from "./meta";
import { initialNetwork, type NetworkState } from "./network";
import { initialOrigins, initialPackageSources, initialPackages, type MockPackage } from "./packages";

type S = components["schemas"];

export const SCENARIOS = ["ready", "fresh", "signed-out", "user", "degraded", "big-store", "slow-pages"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type MockInvite = S["Invite"] & { token: string };

export interface MockLibraryEntry {
  user_id: string;
  work_id: string;
  added_at: string;
  new_chapters: number;
  auto_download: boolean;
}

export interface MockDb extends JobsState, NetworkState {
  users: S["User"][];
  passwords: Record<string, string>;
  /** The signed-in user's ID; undefined when signed out. */
  currentUserId: string | undefined;
  setupCompletedAt: string | undefined;
  sessions: S["Session"][];
  apiKeys: S["ApiKey"][];
  meta: S["MetaConnection"];
  /** Providers being synced: each check adds entries until ready. */
  syncing: string[];
  /** meta's provider sync runs, newest first. */
  metaSyncRuns: S["MetaSyncRun"][];
  duplicates: S["DuplicatePair"][];
  searchEngine: S["MetaSearchEngine"];
  /** The key the admin saved for the search engine (never returned). */
  searchEngineKey: string | undefined;
  judge: S["DuplicateJudge"];
  /** The key the admin saved for the duplicate judge (never returned). */
  judgeKey: string | undefined;
  plugins: S["Plugin"][];
  pluginConfigs: Record<string, S["PluginConfig"]>;
  sources: S["SourceInfo"][];
  invites: MockInvite[];
  failedLogins: number;
  /** Works are shared: one per catalogue entry. */
  works: S["WorkSummary"][];
  /** Each user's library. */
  library: MockLibraryEntry[];
  /** Per work: its matching state on each source. */
  matching: Record<string, S["WorkSourceState"][]>;
  pins: Record<string, Record<string, string>>;
  progress: Record<string, Record<string, S["ChapterProgress"]>>;
  /** Per user: what was taken out of their history (read before these times); read marks stay. */
  historyHidden: Record<string, { all?: string; works: Record<string, string> }>;
  /** The update check: when it last ran, and how many series are still being checked. */
  updates: { last_checked_at: string; checking: number };
  fresh: Record<string, Record<string, string[]>>;
  bookmarks: Record<string, Record<string, string[]>>;
  downloaded: string[];
  /** Per user: reader settings by scope ("global", "source:<id>", "work:<id>"). */
  readerSettings: Record<string, Record<string, Record<string, unknown>>>;
  /** Per user: app preferences. */
  preferences: Record<string, Record<string, unknown>>;
  storages: S["StorageInfo"][];
  /** Page images take 100–1500 ms and long-strip pages vary in height (the slow-pages scenario). */
  slowPages?: boolean;
  /** Per source with the settings capability: its settings. */
  sourceSettings: Record<string, S["SourceSettings"]>;
  /** Per plugin with the packages capability: its packages. */
  packages: Record<string, MockPackage[]>;
  /** By plugin: where its packages come from. */
  origins: Record<string, S["PackageOrigin"][]>;
  /** Image retry settings set on an extension ("package:plugin:package") or a source ("source:id"). */
  imageRetries: Record<string, OwnRetries>;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createDb(scenario: Scenario = "ready"): MockDb {
  const packages = initialPackages();
  const ready: MockDb = {
    users: [clone(adminUser), clone(readerUser)],
    passwords: { admin: "password123", reader: "password123" },
    currentUserId: adminUser.id,
    setupCompletedAt: "2026-10-01T12:00:00Z",
    sessions: [
      clone(session),
      {
        ...clone(session),
        id: "6b1f0a52-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
        current: false,
        user_agent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
        ip: "192.0.2.24",
      },
    ],
    apiKeys: [clone(apiKey)],
    meta: clone(metaConnection),
    syncing: [],
    metaSyncRuns: initialMetaSyncRuns(),
    ...initialDuplicates(),
    searchEngine: initialSearchEngine(),
    searchEngineKey: undefined,
    plugins: [clone(plugin), clone(storePlugin)],
    pluginConfigs: { [plugin.id]: clone(pluginConfig) },
    sourceSettings: { "example:1001": clone(sourceSettings), "stores:3101": clone(sourceSettings) },
    sources: [...clone(sources), ...initialPackageSources(packages)],
    packages: { [storePlugin.id]: packages },
    origins: initialOrigins(),
    imageRetries: {},
    invites: [{ ...clone(invite), token: "open-invite-token" }],
    failedLogins: 0,
    works: [],
    library: [],
    matching: {},
    pins: {},
    progress: {},
    historyHidden: {},
    updates: { last_checked_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), checking: 0 },
    fresh: {},
    bookmarks: {},
    downloaded: [],
    readerSettings: {},
    preferences: {},
    storages: initialStorages(),
    ...initialNetwork(),
    jobs: initialJobs(),
    runs: initialRuns(),
    tasks: initialTasks(),
    pausedKinds: [],
    metaJobs: initialMetaJobs(),
    pluginJobs: initialPluginJobs(),
  };
  for (const job of ready.jobs) {
    const last = ready.runs.find((r) => r.summary.job_id === job.id);
    if (last) job.last_run = last.summary;
  }
  switch (scenario) {
    case "fresh":
      return {
        ...ready,
        users: [],
        passwords: {},
        currentUserId: undefined,
        setupCompletedAt: undefined,
        sessions: [],
        apiKeys: [],
        meta: {
          managed_by_env: false,
          check: {
            configured: false,
            reachable: false,
            key_valid: false,
            admin_scope: false,
            ready: false,
            problem: "Connect the metadata service: enter its URL and an admin API key.",
            providers: [],
            checked_at: new Date().toISOString(),
          },
        },
        plugins: [],
        pluginConfigs: {},
        sources: [],
        packages: {},
        origins: {},
        metaSyncRuns: [],
        invites: [],
      };
    case "slow-pages":
      return { ...ready, slowPages: true };
    case "big-store":
      return { ...ready, packages: { [storePlugin.id]: initialPackages(1_500) } };
    case "signed-out":
      return { ...ready, currentUserId: undefined };
    case "user":
      return { ...ready, currentUserId: readerUser.id };
    case "degraded":
      return {
        ...ready,
        meta: {
          ...ready.meta,
          check: {
            ...ready.meta.check,
            ready: false,
            problem: "No metadata provider has entries yet. Start a sync of a provider and check again.",
            providers: [{ id: "example-provider", health: "ok", records: 0 }],
          },
        },
      };
    default:
      return ready;
  }
}

const STORAGE_KEY = "panelarr.mock.db";
const SCENARIO_KEY = "panelarr.mock.scenario";

let current: MockDb = createDb();

export function db(): MockDb {
  return current;
}

export function resetDb(scenario: Scenario = "ready"): void {
  current = createDb(scenario);
  syncSessionCookie();
}

/**
 * Like the real server, a signed-in browser has the readable CSRF cookie next to the session
 * cookie (the app uses it as a hint that a session exists).
 */
export function syncSessionCookie(): void {
  if (typeof document === "undefined") return;
  // biome-ignore lint/suspicious/noDocumentCookie: the mock plays the server, which sets this cookie
  document.cookie = current.currentUserId
    ? "panelarr_csrf=mock-csrf-token; Path=/; SameSite=Lax"
    : "panelarr_csrf=; Path=/; Max-Age=0; SameSite=Lax";
}

/** Saves the state for the next page load (browser only). Call after every change. */
export function commit(): void {
  if (typeof sessionStorage === "undefined" || !persisting) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the state lasts until the page reloads.
  }
}

let persisting = false;

/** Browser: restore the tab's state, or start the scenario named in `?mock=`. */
export function loadBrowserDb(): Scenario {
  persisting = true;
  const asked = new URLSearchParams(location.search).get("mock");
  try {
    if (asked && (SCENARIOS as readonly string[]).includes(asked)) {
      sessionStorage.setItem(SCENARIO_KEY, asked);
      resetDb(asked as Scenario);
      commit();
      return asked as Scenario;
    }
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) current = JSON.parse(saved) as MockDb;
    else resetDb("ready");
    syncSessionCookie();
    return (sessionStorage.getItem(SCENARIO_KEY) as Scenario | null) ?? "ready";
  } catch {
    return "ready";
  }
}

export function currentUser(): S["User"] | undefined {
  return current.users.find((user) => user.id === current.currentUserId);
}

export function newId(): string {
  return crypto.randomUUID();
}
