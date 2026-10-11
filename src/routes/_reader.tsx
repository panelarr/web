// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EventsProvider } from "@/api/events-context";
import { requireSignedIn } from "@/auth/guard";

/** Full-screen pages for signed-in users, without the app's navigation: the reader. */
export const Route = createFileRoute("/_reader")({
  beforeLoad: async ({ context, location }) => ({ me: await requireSignedIn(context.queryClient, location.href) }),
  component: () => (
    <EventsProvider>
      <Outlet />
    </EventsProvider>
  ),
});
