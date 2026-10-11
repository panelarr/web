// SPDX-License-Identifier: GPL-3.0-or-later

// Loads the API description the app is built against: the server's published spec
// (api/openapi.yaml, copied by `make spec-sync`) plus the draft additions in api/drafts/
// for endpoints the server hasn't specified yet.
//
// A draft file is a partial OpenAPI document with `paths` and `components`. Every draft
// operation is marked with `x-panelarr-draft: true`. Once the server's spec has a path or
// schema a draft also defines, loading fails: the draft has landed and must be removed.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Plain paths, not URL objects: tests load this in a browser-like environment whose URL
// class Node's fs doesn't accept.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "api");
const METHODS = ["get", "put", "post", "patch", "delete", "head", "options"];

export async function loadSpec({ drafts = true } = {}) {
  const spec = parse(await readFile(join(root, "openapi.yaml"), "utf8"));
  const draftOps = [];
  if (!drafts) return { spec, draftOps };

  const files = (await readdir(join(root, "drafts")).catch(() => [])).filter((name) => /\.ya?ml$/.test(name)).sort();
  for (const name of files) {
    const draft = parse(await readFile(join(root, "drafts", name), "utf8")) ?? {};
    for (const [path, item] of Object.entries(draft.paths ?? {})) {
      spec.paths[path] ??= {};
      const target = spec.paths[path];
      for (const [method, op] of Object.entries(item)) {
        if (!METHODS.includes(method)) continue;
        if (target[method]) {
          throw new Error(
            `api/drafts/${name}: ${method.toUpperCase()} ${path} is in the server's spec now; remove it from the draft.`,
          );
        }
        target[method] = { ...op, "x-panelarr-draft": true };
        draftOps.push({ method: method.toUpperCase(), path, operationId: op.operationId ?? "", file: name });
      }
    }
    for (const [section, entries] of Object.entries(draft.components ?? {})) {
      spec.components[section] ??= {};
      const target = spec.components[section];
      for (const [key, value] of Object.entries(entries)) {
        if (target[key]) {
          throw new Error(
            `api/drafts/${name}: components.${section}.${key} is in the server's spec now; remove it from the draft.`,
          );
        }
        target[key] = value;
      }
    }
  }
  return { spec, draftOps };
}
