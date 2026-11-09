// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { HealthOverview } from "@/features/admin/health-overview";

export const Route = createFileRoute("/_app/admin/health")({
  component: HealthOverview,
});
