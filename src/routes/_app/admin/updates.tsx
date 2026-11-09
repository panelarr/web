// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { AllUpdates } from "@/features/extensions/all-updates";

/** Extension updates across plugins. `/updates` stays the reader's feed of new chapters. */
export const Route = createFileRoute("/_app/admin/updates")({
  component: AllUpdates,
});
