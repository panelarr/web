// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Browsing a source moved to Admin → Sources (only admins browse sources directly). Old links
 * to a source or one of its series land on the same page there, with their search kept.
 */
export const Route = createFileRoute("/_app/browse/sources/$")({
  beforeLoad: ({ context, params, location }) => {
    if (context.me.user.role !== "admin") throw redirect({ to: "/browse", replace: true });
    const [sourceId = "", rest] = params._splat?.split("/") ?? [];
    throw redirect({
      to: rest === "series" ? "/admin/sources/$sourceId/series" : "/admin/sources/$sourceId",
      params: { sourceId },
      search: location.search as never,
      replace: true,
    });
  },
});
