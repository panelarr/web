// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/states";

export const Route = createFileRoute("/_app/downloads")({
  component: DownloadsPage,
});

function DownloadsPage() {
  return (
    <>
      <PageHeader title="Downloads" />
      <EmptyState icon={<Download />} title="No downloads">
        Chapters you download show up here with their progress.
      </EmptyState>
    </>
  );
}
