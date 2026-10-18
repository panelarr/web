// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";
import type { MockDb } from "./db";

type S = components["schemas"];
export type OwnRetries = NonNullable<S["ImageRetries"]["own"]>;

/** The server's default: 2 more attempts, after 1 s and then 3 s. */
export const DEFAULT_DELAYS = [1000, 3000];

export const packageKey = (pluginId: string, packageId: string) => `package:${pluginId}:${packageId}`;
export const sourceKey = (sourceId: string) => `source:${sourceId}`;

const delays = (list: readonly number[]): S["ImageRetryDelays"] => ({ delays_ms: [...list], attempts: list.length });

/** An extension's setting: its own, else the default. */
export function packageRetries(d: MockDb, pluginId: string, packageId: string): S["ImageRetries"] {
  const own = d.imageRetries[packageKey(pluginId, packageId)];
  return {
    target_kind: "package",
    target_id: `${pluginId}:${packageId}`,
    ...(own ? { own } : {}),
    effective: delays(own?.delays_ms ?? DEFAULT_DELAYS),
    level: own ? "package" : "default",
    ...(own ? { from_target_id: `${pluginId}:${packageId}` } : {}),
  };
}

/** A source's setting: its own, else its extension's, else the default. */
export function sourceRetries(d: MockDb, source: S["SourceInfo"]): S["ImageRetries"] {
  const own = d.imageRetries[sourceKey(source.id)];
  const target = { target_kind: "source" as const, target_id: source.id, ...(own ? { own } : {}) };
  if (own) return { ...target, effective: delays(own.delays_ms), level: "source", from_target_id: source.id };
  const pkg = source.package_id ? packageRetries(d, source.plugin_id, source.package_id) : undefined;
  if (pkg?.own) {
    return { ...target, effective: pkg.effective, level: "package", from_target_id: pkg.target_id };
  }
  return { ...target, effective: delays(DEFAULT_DELAYS), level: "default" };
}

/** What the server accepts: at most 5 waits, each 0–30 s. */
export function validDelays(list: unknown): list is number[] {
  return (
    Array.isArray(list) &&
    list.length <= 5 &&
    list.every((ms) => Number.isInteger(ms) && (ms as number) >= 0 && (ms as number) <= 30_000)
  );
}
