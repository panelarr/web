// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <>
      <PageHeader title="Admin" />
      <EmptyState icon={<Shield />} title="Nothing here yet">
        Users, plugins, sources and jobs are managed here.
      </EmptyState>
    </>
  );
}
