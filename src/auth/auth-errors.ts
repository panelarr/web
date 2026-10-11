// SPDX-License-Identifier: GPL-3.0-or-later

import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { isApiError } from "@/api/errors";
import { isPublicPath } from "./session";

/**
 * What to do when any API call says the session is gone or the server isn't set up:
 * forget everything cached and go to sign-in (coming back here afterwards) or to the wizard.
 */
export function createAuthErrorHandler(getRouter: () => AnyRouter | undefined, getQueryClient: () => QueryClient) {
  let handling = false;
  return (error: unknown, queryKey?: readonly unknown[]) => {
    const router = getRouter();
    // The routes probe /me themselves and redirect as needed.
    if (!router || handling || queryKey?.[1] === "/me") return;
    const { pathname, href } = router.state.location;
    if (isPublicPath(pathname)) return;
    if (isApiError(error, "unauthenticated")) {
      handling = true;
      getQueryClient().clear();
      void router.navigate({ to: "/login", search: { redirect: href, expired: true } }).finally(() => {
        handling = false;
      });
    } else if (isApiError(error, "setup_required")) {
      handling = true;
      void router.navigate({ to: "/setup" }).finally(() => {
        handling = false;
      });
    }
  };
}
