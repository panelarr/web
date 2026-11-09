// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, redirect } from "@tanstack/react-router";

/** System became Health (everything Panelarr depends on); old links and bookmarks land there. */
export const Route = createFileRoute("/_app/admin/system")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/health", replace: true });
  },
});
