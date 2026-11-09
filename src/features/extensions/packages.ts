// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";
import { formatVersion } from "@/lib/version";

export type Package = components["schemas"]["Package"];

/** What the Extensions tab shows; kept in the URL. */
export interface PackageFilter {
  q?: string;
  lang?: string;
  show?: "installed" | "updates";
}

/**
 * The packages that match, in display order. The tab filters the full list it already has (as
 * Admin → Sources does): every change is instant, and the same list gives the languages and the
 * counts.
 */
export function filterPackages(packages: readonly Package[], filter: PackageFilter): Package[] {
  const q = filter.q?.trim().toLowerCase();
  return sortPackages(
    packages.filter(
      (p) =>
        (!q || [p.name, p.id, ...p.sources.map((s) => s.name)].some((name) => name.toLowerCase().includes(q))) &&
        (!filter.lang || p.langs.includes(filter.lang) || p.sources.some((s) => s.lang === filter.lang)) &&
        (filter.show !== "installed" || p.installed) &&
        (filter.show !== "updates" || p.update_available),
    ),
  );
}

/**
 * What needs the admin first: updates, then the rest of what's installed, then everything else,
 * each by name. The sort is stable, so equal names keep the store's order.
 */
export function sortPackages(packages: readonly Package[]): Package[] {
  return [...packages].sort(
    (a, b) =>
      Number(b.update_available) - Number(a.update_available) ||
      Number(b.installed) - Number(a.installed) ||
      a.name.localeCompare(b.name),
  );
}

/** Every language the packages cover, sorted, with "all" and "multi" last. */
export function packageLanguages(packages: readonly Package[]): string[] {
  const special = (lang: string) => lang === "all" || lang === "multi";
  return [...new Set(packages.flatMap((p) => p.langs))].sort(
    (a, b) => Number(special(a)) - Number(special(b)) || a.localeCompare(b),
  );
}

/** "v2.0.0 → v2.1.0" for an update, else the installed (or offered) version. */
export function versionLabel(p: Package): string {
  if (p.installed && p.installed_version) {
    return p.update_available
      ? `${formatVersion(p.installed_version)} → ${formatVersion(p.version)}`
      : formatVersion(p.installed_version);
  }
  return formatVersion(p.version);
}

/** Where it comes from: the store's name, or how many offer it. */
export function originLabel(p: Package): string {
  const names = [...new Set(p.offers.map((o) => o.origin_name))];
  return names.length === 1 ? (names[0] as string) : `${names.length} stores`;
}

export type PackageAction = "install" | "update" | "uninstall";

export const ACTION_LABELS: Record<PackageAction, { doing: string; done: string; failed: string }> = {
  install: { doing: "Installing", done: "installed", failed: "Install failed" },
  update: { doing: "Updating", done: "updated", failed: "Update failed" },
  uninstall: { doing: "Uninstalling", done: "uninstalled", failed: "Uninstall failed" },
};
