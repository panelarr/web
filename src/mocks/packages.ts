// SPDX-License-Identifier: GPL-3.0-or-later

// Packages for the mock server: a plugin that hosts many sites offers packages (extensions)
// from two stores. Installing, updating and uninstalling are tasks that move on a step at a
// time; when one finishes, the plugin's sources follow, as on a real server.
import type { components } from "@/api/schema.gen";
import { emit } from "./events";
import { taskEvent } from "./jobs";

type S = components["schemas"];

export const KIND = "plugin.package";
export const STORE_PLUGIN = "stores";

/** A package as the mock keeps it: without the derived fields. */
export type MockPackage = Omit<S["Package"], "sources" | "task_id"> & {
  sources: Array<{ key: string; name: string; lang: string }>;
};

export interface PackagesState {
  packages: Record<string, MockPackage[]>;
  sources: S["SourceInfo"][];
  plugins: S["Plugin"][];
  tasks: S["Task"][];
  pausedKinds: string[];
}

const OFFERS = (version: string, supported = true): S["PackageOffer"][] => [
  { origin_id: "main", origin_name: "Main store", version, supported },
  { origin_id: "mirror", origin_name: "Mirror store", version, supported },
];

const LANGS = ["en", "ja", "es", "fr", "de", "pt-BR", "it", "ko"];

export function initialPackages(): MockPackage[] {
  const named: MockPackage[] = [
    {
      id: "org.example.polyglot",
      name: "Polyglot Comics",
      langs: ["en", "ja", "es"],
      version: "2.1.0",
      installed: true,
      installed_version: "2.0.0",
      update_available: true,
      content_rating: "safe",
      supported: true,
      offers: OFFERS("2.1.0"),
      enabled_langs: ["ja"],
      sources: [
        { key: "3001", name: "Polyglot Comics", lang: "en" },
        { key: "3002", name: "Polyglot Comics", lang: "ja" },
        { key: "3003", name: "Polyglot Comics", lang: "es" },
      ],
    },
    {
      id: "org.example.lantern",
      name: "Lantern Reader",
      langs: ["en"],
      version: "1.4.2",
      installed: false,
      update_available: false,
      content_rating: "safe",
      supported: true,
      offers: OFFERS("1.4.2"),
      enabled_langs: [],
      sources: [{ key: "3101", name: "Lantern Reader", lang: "en" }],
    },
    {
      id: "org.example.nightshelf",
      name: "Night Shelf",
      langs: ["fr"],
      version: "0.9.0",
      installed: false,
      update_available: false,
      content_rating: "nsfw",
      supported: true,
      offers: [{ origin_id: "mirror", origin_name: "Mirror store", version: "0.9.0", supported: true }],
      enabled_langs: [],
      sources: [{ key: "3201", name: "Night Shelf", lang: "fr" }],
    },
    {
      id: "org.example.oldscans",
      name: "Old Scans",
      langs: ["en"],
      version: "0.3.1",
      installed: false,
      update_available: false,
      content_rating: "unknown",
      supported: false,
      offers: OFFERS("0.3.1", false),
      enabled_langs: [],
      sources: [{ key: "3301", name: "Old Scans", lang: "en" }],
    },
  ];
  // Plenty more, as a real store has hundreds.
  const more = Array.from({ length: 60 }, (_, i): MockPackage => {
    const lang = LANGS[i % LANGS.length] as string;
    const name = `Example Site ${String(i + 1).padStart(2, "0")}`;
    return {
      id: `org.example.site${i + 1}`,
      name,
      langs: [lang],
      version: `1.${i % 5}.0`,
      installed: false,
      update_available: false,
      content_rating: i % 9 === 0 ? "mixed" : "safe",
      supported: true,
      offers: OFFERS(`1.${i % 5}.0`),
      enabled_langs: [],
      sources: [{ key: String(4000 + i), name, lang }],
    };
  });
  return [...named, ...more];
}

/** The sources of the installed packages, as the server lists them. */
export function initialPackageSources(packages: MockPackage[]): S["SourceInfo"][] {
  return packages.filter((p) => p.installed).flatMap((p) => packageSources(p, undefined));
}

const sourceId = (key: string) => `${STORE_PLUGIN}:${key}`;

function available(pkg: MockPackage, lang: string): boolean {
  return pkg.enabled_langs.length === 0 || pkg.enabled_langs.includes(lang);
}

/** A package's sources as SourceInfo, keeping what the admin set on ones already known. */
function packageSources(pkg: MockPackage, known: S["SourceInfo"][] | undefined): S["SourceInfo"][] {
  return pkg.sources.map((s) => {
    const before = known?.find((k) => k.id === sourceId(s.key));
    const on = available(pkg, s.lang);
    return {
      id: sourceId(s.key),
      plugin_id: STORE_PLUGIN,
      name: s.name,
      lang: s.lang,
      content_rating: pkg.content_rating,
      capabilities: ["latest", "search"],
      health: before?.health ?? { status: "unknown" },
      // Polyglot's Japanese source starts turned off by the admin.
      enabled: before?.enabled ?? s.key !== "3002",
      present: pkg.installed && on,
      ...(pkg.installed && !on ? { unavailable_reason: "language" as const } : {}),
      package_id: pkg.id,
      package_name: pkg.name,
    };
  });
}

/** Brings the plugin's sources in line with its packages (what a sync does). */
export function syncPackageSources(state: PackagesState, pluginId: string): void {
  const packages = state.packages[pluginId] ?? [];
  const others = state.sources.filter((s) => s.plugin_id !== pluginId);
  const mine = state.sources.filter((s) => s.plugin_id === pluginId);
  const next: S["SourceInfo"][] = [];
  for (const pkg of packages) {
    const listed = packageSources(pkg, mine);
    // Sources of an uninstalled package stay, absent, so works keep their history.
    next.push(...(pkg.installed ? listed : listed.filter((s) => mine.some((m) => m.id === s.id))));
  }
  state.sources = [...others, ...next];
  const plugin = state.plugins.find((p) => p.id === pluginId);
  if (plugin) plugin.source_count = next.filter((s) => s.present).length;
}

/** A package as the API shows it. */
export function packageView(state: PackagesState, pluginId: string, pkg: MockPackage): S["Package"] {
  const open = state.tasks.find(
    (t) =>
      t.kind === KIND &&
      t.payload.plugin_id === pluginId &&
      t.payload.package_id === pkg.id &&
      (t.state === "queued" || t.state === "running"),
  );
  return {
    ...pkg,
    sources: pkg.sources.map((s) => ({
      id: sourceId(s.key),
      name: s.name,
      lang: s.lang,
      available: available(pkg, s.lang),
    })),
    ...(open ? { task_id: open.id } : {}),
  };
}

export type PackageAction = "install" | "update" | "uninstall";

/** Queues an action on a package; the same one already queued or running is returned instead. */
export function queuePackageTask(
  state: PackagesState,
  pluginId: string,
  pkg: MockPackage,
  action: PackageAction,
  userId: string,
  originId?: string,
): S["Task"] {
  const open = state.tasks.find(
    (t) =>
      t.kind === KIND &&
      t.payload.plugin_id === pluginId &&
      t.payload.package_id === pkg.id &&
      t.payload.action === action &&
      (t.state === "queued" || t.state === "running"),
  );
  if (open) return open;
  const now = new Date().toISOString();
  const task: S["Task"] = {
    id: crypto.randomUUID(),
    kind: KIND,
    state: "queued",
    priority: 0,
    attempts: 0,
    max_attempts: 1,
    run_after: now,
    payload: { plugin_id: pluginId, package_id: pkg.id, action, ...(originId ? { origin_id: originId } : {}) },
    created_by: userId,
    created_at: now,
  };
  state.tasks.unshift(task);
  taskEvent("task.queued", task);
  return task;
}

const STEPS = 3;

/** Moves package tasks on: start, a progress step, then done and the plugin synced. */
export function tickPackages(state: PackagesState): boolean {
  if (state.pausedKinds.includes(KIND)) return false;
  let changed = false;
  for (const task of state.tasks.filter((t) => t.kind === KIND && t.state === "running")) {
    const done = (task.progress?.done ?? 0) + 1;
    changed = true;
    if (done < STEPS) {
      task.progress = { phase: "installing", done, total: STEPS, unit: "steps" };
      taskEvent("task.progress", task);
      continue;
    }
    finish(state, task);
  }
  for (const task of state.tasks.filter((t) => t.kind === KIND && t.state === "queued").reverse()) {
    task.state = "running";
    task.attempts += 1;
    task.started_at = new Date().toISOString();
    task.progress = { phase: "installing", done: 0, total: STEPS, unit: "steps" };
    taskEvent("task.started", task);
    changed = true;
  }
  return changed;
}

function finish(state: PackagesState, task: S["Task"]): void {
  const pluginId = String(task.payload.plugin_id);
  const pkg = state.packages[pluginId]?.find((p) => p.id === task.payload.package_id);
  delete task.progress;
  task.finished_at = new Date().toISOString();
  if (!pkg) {
    task.state = "failed";
    task.last_error = "the package is gone";
  } else if (task.payload.action !== "uninstall" && !pkg.supported) {
    task.state = "failed";
    task.last_error = "this version needs a newer plugin";
  } else {
    task.state = "succeeded";
    if (task.payload.action === "uninstall") {
      pkg.installed = false;
      delete pkg.installed_version;
      pkg.update_available = false;
    } else {
      pkg.installed = true;
      pkg.installed_version = pkg.version;
      pkg.update_available = false;
    }
    syncPackageSources(state, pluginId);
  }
  taskEvent("task.updated", task);
  const plugin = state.plugins.find((p) => p.id === pluginId);
  if (plugin) emit("plugin.health", { plugin_id: plugin.id, health: plugin.health });
}
