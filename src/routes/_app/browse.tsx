// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/_app/browse")({
  component: BrowsePage,
});

function BrowsePage() {
  return (
    <>
      <PageHeader title="Browse" />
      <EmptyState icon={<Compass />} title="Nothing to browse yet">
        Search the catalogue and your sources here.
      </EmptyState>
    </>
  );
}
