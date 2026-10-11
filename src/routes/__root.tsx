// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startTheming } from "@/theme/theme";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-xl px-gutter py-16">
      <ErrorAlert error={error} title="This page failed to load" onRetry={reset} />
    </div>
  ),
});

function Root() {
  // theme-boot.js painted the saved theme already; from here the app keeps it applied.
  useLayoutEffect(() => startTheming(), []);
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-gutter py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">There's nothing at this address.</p>
      <Button asChild>
        <Link to="/">Go to your library</Link>
      </Button>
    </div>
  );
}
