// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { isApiError } from "@/api/errors";
import { clearSessionHint, hasSessionHint, type Me, meQuery, setupQuery, systemInfoQuery } from "./session";

/**
 * For every signed-in page: sends visitors to sign in (coming back afterwards), a new install
 * to the wizard, and an admin on an unfinished setup back to it. It asks the server who the
 * user is only when a session is likely, so visitors cause no failed requests.
 */
export async function requireSignedIn(queryClient: QueryClient, href: string): Promise<Me> {
  // "Setup required" changes as soon as the admin exists: never trust an old answer saying so.
  const info = await queryClient.fetchQuery({
    ...systemInfoQuery(),
    staleTime: (query) => (query.state.data?.setup_required ? 0 : 60_000),
  });
  if (info.setup_required) throw redirect({ to: "/setup" });
  if (!hasSessionHint()) throw redirect({ to: "/login", search: { redirect: href } });
  const me = await queryClient.ensureQueryData(meQuery()).catch((error: unknown) => {
    if (isApiError(error, "setup_required")) throw redirect({ to: "/setup" });
    if (isApiError(error, "unauthenticated")) {
      clearSessionHint();
      throw redirect({ to: "/login", search: { redirect: href } });
    }
    throw error;
  });
  if (me.user.role === "admin") {
    const setup = await queryClient.ensureQueryData(setupQuery());
    if (!setup.completed) throw redirect({ to: "/setup" });
  }
  return me;
}
