// SPDX-License-Identifier: GPL-3.0-or-later

// Copies the server's API spec from a server clone next to this repo:
//
//   pnpm spec:sync     copy api/openapi.yaml from the server's main branch, record its commit
//   pnpm spec:check    fail when the copy differs from the server's main branch
//
// SERVER_REPO (default ../server) and SERVER_REF (default main) override the source.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const repo = process.env.SERVER_REPO || new URL("../../server", import.meta.url).pathname;
const ref = process.env.SERVER_REF || "main";
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

let commit;
let spec;
try {
  commit = git("rev-parse", `${ref}^{commit}`).trim();
  spec = git("show", `${commit}:api/openapi.yaml`);
} catch {
  console.error(
    `Can't read api/openapi.yaml at ${ref} in ${repo}. Clone the server next to this repo or set SERVER_REPO.`,
  );
  process.exit(2);
}

const target = new URL("../api/openapi.yaml", import.meta.url);
const sourceFile = new URL("../api/SPEC_SOURCE", import.meta.url);

if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== spec) {
    console.error(
      `api/openapi.yaml differs from the server's ${ref} (${commit.slice(0, 12)}). Run \`make spec-sync\`.`,
    );
    process.exit(1);
  }
  console.log(`api/openapi.yaml matches the server's ${ref} (${commit.slice(0, 12)}).`);
} else {
  const date = git("show", "-s", "--format=%cs", commit).trim();
  await writeFile(target, spec);
  await writeFile(sourceFile, `panelarr/server ${commit} ${date}\n`);
  console.log(
    `Copied api/openapi.yaml from the server's ${ref} (${commit.slice(0, 12)}, ${date}). Now run \`make gen\`.`,
  );
}
