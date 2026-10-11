// SPDX-License-Identifier: GPL-3.0-or-later

import { setupWorker } from "msw/browser";
import { commit, db, loadBrowserDb } from "./db";
import { createEventsHandler, operations } from "./handlers";
import { tickJobs } from "./jobs";
import { isDraft } from "./op";

/**
 * Starts the mock server in the browser. "all" answers every request (no server needed);
 * "drafts" answers only the endpoints the server's spec doesn't have yet and lets the rest
 * through to the real server. `?mock=<scenario>` picks the starting state (src/mocks/db.ts).
 */
export async function startMockWorker(mode: "all" | "drafts"): Promise<void> {
  const picked = mode === "all" ? operations : operations.filter(isDraft);
  if (picked.length === 0) return;
  const scenario = loadBrowserDb();
  const handlers = picked.map((operation) => operation.handler);
  const worker = setupWorker(...(mode === "all" ? [...handlers, createEventsHandler()] : handlers));
  if (mode === "all") {
    // Running jobs move on every second, with live events, as on a real server.
    setInterval(() => {
      if (tickJobs(db())) commit();
    }, 1_000);
  }
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: mode === "all" ? "warn" : "bypass",
    quiet: mode === "drafts",
  });
  console.info(
    mode === "all"
      ? `Panelarr: mocking the whole API (scenario "${scenario}"; change it with ?mock=fresh|ready|signed-out|user|degraded).`
      : `Panelarr: mocking ${picked.length} draft endpoints.`,
  );
}
