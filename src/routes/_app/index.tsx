// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { LibraryBig } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/_app/")({
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <EmptyState icon={<LibraryBig />} title="Your library is empty">
        Works you add show up here.
      </EmptyState>
    </>
  );
}
