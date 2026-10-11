// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The server hands out links to its own files (covers, page images) as paths from its root,
 * e.g. "/api/v1/catalog/entries/x/cover". Resolve them against the app's base so they keep
 * working when Panelarr runs under a URL base.
 */
export function serverUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return new URL(path.replace(/^\//, ""), document.baseURI).href;
}
