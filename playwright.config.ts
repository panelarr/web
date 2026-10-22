// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 5174);
const previewPort = Number(process.env.E2E_PREVIEW_PORT || 4174);

/**
 * Smoke tests against the dev server in full mock mode (no Panelarr server needed), on a
 * desktop and a small phone; plus the production build under the server's CSP.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry everywhere: a run on a busy machine shouldn't fail on one slow moment, and the
  // retry records a trace, so a real failure still shows what happened.
  retries: process.env.CI ? 2 : 1,
  // The pages are served by the dev server; give it room when the machine is busy.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /csp\.spec/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      testIgnore: /csp\.spec/,
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } },
    },
    // The reader on iOS Safari's engine, when WebKit is installed (`make e2e-webkit`).
    ...(process.env.E2E_WEBKIT
      ? [
          {
            name: "phone-webkit",
            testMatch: /(reader(-stability)?|strip-preload)\.spec/,
            use: { ...devices["iPhone 13"], viewport: { width: 375, height: 740 } },
          },
        ]
      : []),
    {
      name: "csp",
      testMatch: /csp\.spec/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${previewPort}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --mode mock --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm exec vite preview --port ${previewPort} --strictPort`,
      url: `http://localhost:${previewPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
