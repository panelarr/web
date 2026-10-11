// SPDX-License-Identifier: GPL-3.0-or-later

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@/api/query-client";
import { registerServiceWorker } from "@/pwa";
import { createAppRouter } from "@/router";
import { startTheming } from "@/theme/theme";
import "@/styles.css";

async function enableMocks(): Promise<void> {
  const mode = import.meta.env.VITE_MOCK;
  if (!import.meta.env.DEV || !mode || mode === "off") return;
  const { startMockWorker } = await import("@/mocks/browser");
  await startMockWorker(mode === "all" ? "all" : "drafts");
}

startTheming();
await enableMocks();

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD) registerServiceWorker();
