// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImportPreview } from "@/features/imports/import-preview";
import { isOutcomeTab, type OutcomeTab } from "@/features/imports/imports";

export const Route = createFileRoute("/_app/settings_/imports/$importId")({
  validateSearch: (search: Record<string, unknown>): { outcome?: OutcomeTab } =>
    isOutcomeTab(search.outcome) ? { outcome: search.outcome } : {},
  component: ImportPage,
});

function ImportPage() {
  const { importId } = Route.useParams();
  const { outcome } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ImportPreview
      key={importId}
      importId={importId}
      outcome={outcome}
      onOutcome={(next) => void navigate({ search: { outcome: next }, replace: true })}
    />
  );
}
