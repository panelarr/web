// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, redirect } from "@tanstack/react-router";

/** Sources are an admin concern now: old links go to Admin → Sources, or to Browse. */
export const Route = createFileRoute("/_app/browse/sources/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.me.user.role === "admin" ? "/admin/sources" : "/browse", replace: true });
  },
});
