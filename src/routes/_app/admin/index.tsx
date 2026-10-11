// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users", replace: true });
  },
});
