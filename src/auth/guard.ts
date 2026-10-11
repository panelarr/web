// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { isApiError } from "@/api/errors";
import { type Me, meQuery, setupQuery } from "./session";

/**
 * For every signed-in page: sends visitors to sign in (coming back afterwards), a new install
 * to the wizard, and an admin on an unfinished setup back to it.
 */
export async function requireSignedIn(queryClient: QueryClient, href: string): Promise<Me> {
  const me = await queryClient.ensureQueryData(meQuery()).catch((error: unknown) => {
    if (isApiError(error, "setup_required")) throw redirect({ to: "/setup" });
    if (isApiError(error, "unauthenticated")) throw redirect({ to: "/login", search: { redirect: href } });
    throw error;
  });
  if (me.user.role === "admin") {
    const setup = await queryClient.ensureQueryData(setupQuery());
    if (!setup.completed) throw redirect({ to: "/setup" });
  }
  return me;
}
