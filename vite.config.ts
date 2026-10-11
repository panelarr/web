// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { SECURITY_HEADERS } from "./csp.config.mjs";

const require = createRequire(import.meta.url);

/**
 * Serves MSW's service worker from node_modules while mocking, so the worker file is
 * never copied into public/ and can't end up in a production build.
 */
function mockServiceWorker(): Plugin {
  return {
    name: "panelarr-mock-service-worker",
    apply: "serve",
    configureServer(server) {
      const file = require.resolve("msw/mockServiceWorker.js");
      server.middlewares.use("/mockServiceWorker.js", (_req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // "all": every request is answered by the mock server; "drafts": only the draft
  // endpoints are, the rest go to a real server; "off" (or unset): no mocks.
  const mock = env.VITE_MOCK || "off";
  if (command === "build" && mock !== "off") {
    throw new Error(`Mocks are for the dev server only; don't build with VITE_MOCK=${mock}.`);
  }

  // The Panelarr server the dev server proxies /api to.
  const backend = env.PANELARR_BACKEND || "http://localhost:8900";

  return {
    // Relative asset paths, resolved against <base href> in index.html, so the server can
    // later serve the app under a URL base without a rebuild.
    base: "./",
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon.png", "theme-boot.js"],
        manifest: {
          id: "./",
          name: "Panelarr",
          short_name: "Panelarr",
          description: "Your manga, manhwa, manhua and comics library and reader.",
          start_url: "./",
          scope: "./",
          display: "standalone",
          orientation: "any",
          background_color: "#0b0b0f",
          theme_color: "#0b0b0f",
          shortcuts: [
            { name: "Library", url: "./", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
            { name: "Browse", url: "./browse", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
            { name: "Downloads", url: "./downloads", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          ],
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
          ],
        },
        workbox: {
          // Only the app shell is cached. API responses, pages and events never are.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/opds\//, /^\/healthz/, /^\/readyz/, /^\/metrics/],
          cleanupOutdatedCaches: true,
        },
      }),
      ...(mock !== "off" ? [mockServiceWorker()] : []),
    ],
    // Scan every route up front: routes load lazily, and a dependency found late makes the dev
    // server reload the page (which also makes browser tests flaky).
    optimizeDeps: { entries: ["index.html", "src/routes/**/*.tsx"] },
    server: {
      port: Number(env.WEB_PORT || 5173),
      proxy: mock === "all" ? undefined : { "/api": { target: backend, changeOrigin: false } },
    },
    // The production build, with the headers the server sends (see csp.config.mjs).
    preview: {
      port: Number(env.PREVIEW_PORT || 4173),
      headers: SECURITY_HEADERS,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "es2022",
      // Plain files only: the server serves them under a strict CSP.
      assetsInlineLimit: 0,
    },
    test: {
      environment: "jsdom",
      environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
      setupFiles: ["src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  };
});
