// SPDX-License-Identifier: GPL-3.0-or-later

import { setupWorker } from "msw/browser";
import { commit, db, loadBrowserDb } from "./db";
import { tickDownloads } from "./downloads";
import { createEventsHandler, operations } from "./handlers";
import { tickImports } from "./imports";
import { tickJobs } from "./jobs";
import { tickMetaSyncs } from "./meta";
import { isDraft } from "./op";
import { tickPackages } from "./packages";
import { answerSsoNavigation } from "./provider-pages";
import { tickMatching } from "./works";

/**
 * Starts the mock server in the browser. "all" answers every request (no server needed);
 * "drafts" answers only the endpoints the server's spec doesn't have yet and lets the rest
 * through to the real server. `?mock=<scenario>` picks the starting state (src/mocks/db.ts).
 */
export async function startMockWorker(mode: "all" | "drafts"): Promise<void> {
  const picked = mode === "all" ? operations : operations.filter(isDraft);
  if (picked.length === 0) return;
  const scenario = loadBrowserDb();
  // Single sign-on's navigations (start, the provider, its callback) are answered here instead
  // of starting the app; the page then moves on by itself.
  if (mode === "all" && answerSsoNavigation()) return new Promise(() => {});
  const handlers = picked.map((operation) => operation.handler);
  const worker = setupWorker(...(mode === "all" ? [...handlers, createEventsHandler()] : handlers));
  if (mode === "all") {
    // Running jobs move on every second, with live events, as on a real server.
    setInterval(() => {
      const jobs = tickJobs(db());
      const matching = tickMatching(db());
      const downloads = tickDownloads(db());
      const packages = tickPackages(db());
      const syncs = tickMetaSyncs(db());
      const imports = tickImports(db());
      if (jobs || matching || downloads || packages || syncs || imports) commit();
    }, 1_000);
  }
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: mode === "all" ? "warn" : "bypass",
    quiet: mode === "drafts",
  });
  console.info(
    mode === "all"
      ? `Panelarr: mocking the whole API (scenario "${scenario}"; change it with ?mock=fresh|ready|signed-out|user|degraded|sso|sso-signed-out|sso-admins).`
      : `Panelarr: mocking ${picked.length} draft endpoints.`,
  );
}
