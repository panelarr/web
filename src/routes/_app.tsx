// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isApiError } from "@/api/errors";
import { meQuery, setupQuery } from "@/auth/session";
import { AppShell } from "@/components/app-shell";

/** Every signed-in page. Sends visitors to sign in, and a new install to the wizard. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery()).catch((error: unknown) => {
      if (isApiError(error, "setup_required")) throw redirect({ to: "/setup" });
      if (isApiError(error, "unauthenticated")) throw redirect({ to: "/login", search: { redirect: location.href } });
      throw error;
    });
    if (me.user.role === "admin") {
      const setup = await context.queryClient.ensureQueryData(setupQuery());
      if (!setup.completed) throw redirect({ to: "/setup" });
    }
    return { me };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
