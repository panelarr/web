// SPDX-License-Identifier: GPL-3.0-or-later

/** "v1.2.3" for release numbers; anything else (e.g. "dev", a commit) as it is. */
export function formatVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}
