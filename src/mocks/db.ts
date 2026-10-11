// SPDX-License-Identifier: GPL-3.0-or-later

// The mock server's state: a tiny in-memory Panelarr. Scenarios set the starting point:
//
//   ready       set up, signed in as the admin (the default)
//   fresh       a new install: no accounts, nothing connected
//   signed-out  set up, nobody signed in
//   user        set up, signed in as a user without admin rights
//   degraded    set up and signed in, but the metadata service has no entries yet
//
// In the browser, pick one with `?mock=<scenario>`; it lasts for the tab (sessionStorage).
import type { components } from "@/api/schema.gen";
import { adminUser, apiKey, invite, metaConnection, plugin, pluginConfig, readerUser, session, sources } from "./data";
import { initialJobs, initialRuns, initialTasks, type JobsState } from "./jobs";

type S = components["schemas"];

export const SCENARIOS = ["ready", "fresh", "signed-out", "user", "degraded"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type MockInvite = S["Invite"] & { token: string };

export interface MockLibraryEntry {
  user_id: string;
  work_id: string;
  added_at: string;
  new_chapters: number;
  auto_download: boolean;
}

export interface MockDb extends JobsState {
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
  fresh: Record<string, Record<string, string[]>>;
  downloaded: string[];
  /** Per user: reader settings by scope ("global", "source:<id>", "work:<id>"). */
  readerSettings: Record<string, Record<string, Record<string, unknown>>>;
  /** Per user: app preferences. */
  preferences: Record<string, Record<string, unknown>>;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createDb(scenario: Scenario = "ready"): MockDb {
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
    plugins: [clone(plugin)],
    pluginConfigs: { [plugin.id]: clone(pluginConfig) },
    sources: clone(sources),
    invites: [{ ...clone(invite), token: "open-invite-token" }],
    failedLogins: 0,
    works: [],
    library: [],
    matching: {},
    pins: {},
    progress: {},
    fresh: {},
    downloaded: [],
    readerSettings: {},
    preferences: {},
    jobs: initialJobs(),
    runs: initialRuns(),
    tasks: initialTasks(),
    pausedKinds: [],
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
        invites: [],
      };
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
