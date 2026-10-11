// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EventsProvider } from "@/api/events-context";
import { requireSignedIn } from "@/auth/guard";
import { AppShell } from "@/components/app-shell";

/** Every signed-in page. Sends visitors to sign in, and a new install to the wizard. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => ({ me: await requireSignedIn(context.queryClient, location.href) }),
  component: () => (
    <EventsProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </EventsProvider>
  ),
});
