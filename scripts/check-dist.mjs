// SPDX-License-Identifier: GPL-3.0-or-later

// Fails the build when dist/ has anything a strict CSP would block (inline scripts and
// styles, eval), loads anything from another host, holds mock-mode code, or outgrows its
// size budget.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// Size budgets (gzipped): what the first visit downloads, and all scripts together. Raise them
// on purpose, in review, never to make a build pass.
const BUDGET_INITIAL_KB = 260;
const BUDGET_SCRIPTS_KB = 450;

const dist = new URL("../dist/", import.meta.url).pathname;
const problems = [];

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

for await (const path of files(dist)) {
  const name = path.slice(dist.length);
  if (/mockServiceWorker/.test(name)) problems.push(`${name}: the mock service worker must not be built`);
  if (!/\.(html|js|css|webmanifest)$/.test(name)) continue;
  const text = await readFile(path, "utf8");
  if (name.endsWith(".html")) {
    for (const tag of text.match(/<script\b[^>]*>/g) ?? []) {
      if (!/\bsrc=/.test(tag)) problems.push(`${name}: inline <script>`);
    }
    if (/<style\b|\sstyle=/.test(text)) problems.push(`${name}: inline style`);
    if (/\son[a-z]+=/.test(text)) problems.push(`${name}: inline event handler`);
    if (/\b(?:src|href)="(?:https?:)?\/\//.test(text)) problems.push(`${name}: loads from another host`);
  }
  if (name.endsWith(".css") && /url\((["']?)(?:https?:)?\/\//.test(text)) {
    problems.push(`${name}: loads from another host`);
  }
  if (name.endsWith(".js")) {
    if (/\beval\(|new Function\(/.test(text)) problems.push(`${name}: eval or new Function`);
    if (/setupWorker|mockServiceWorker/.test(text)) problems.push(`${name}: contains mock mode code`);
  }
}

// The first visit: index.html's scripts, preloads and styles.
const html = await readFile(join(dist, "index.html"), "utf8");
const initial = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let initialBytes = 0;
for (const file of initial) initialBytes += gzipSync(await readFile(join(dist, file))).length;
let scriptBytes = 0;
for (const file of (await readdir(join(dist, "assets"))).filter((f) => f.endsWith(".js"))) {
  scriptBytes += gzipSync(await readFile(join(dist, "assets", file))).length;
}
const kb = (bytes) => Math.round(bytes / 1024);
if (kb(initialBytes) > BUDGET_INITIAL_KB)
  problems.push(`the first visit loads ${kb(initialBytes)} KB gzipped (budget ${BUDGET_INITIAL_KB} KB)`);
if (kb(scriptBytes) > BUDGET_SCRIPTS_KB)
  problems.push(`all scripts are ${kb(scriptBytes)} KB gzipped (budget ${BUDGET_SCRIPTS_KB} KB)`);

if (problems.length > 0) {
  console.error(`dist/ isn't safe to serve under a strict CSP:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `dist/ checked: no inline scripts or styles, eval, other hosts or mock code; first visit ${kb(initialBytes)} KB, all scripts ${kb(scriptBytes)} KB gzipped.`,
);
