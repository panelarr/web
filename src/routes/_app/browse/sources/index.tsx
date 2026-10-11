// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Library } from "lucide-react";
import { useMemo } from "react";
import { $api } from "@/api/client";
import { useIsAdmin } from "@/auth/session";
import { NativeSelect } from "@/components/native-select";
import { SourceIcon } from "@/components/source-icon";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { HealthBadge } from "@/features/admin/health-badge";
import { BrowseTabs } from "@/features/catalog/browse-tabs";

export const Route = createFileRoute("/_app/browse/sources/")({
  validateSearch: (search: Record<string, unknown>): { lang?: string } =>
    typeof search.lang === "string" && search.lang ? { lang: search.lang } : {},
  component: SourcesPage,
});

function SourcesPage() {
  const { lang } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isAdmin = useIsAdmin();
  const sources = $api.useQuery("get", "/sources");
  const all = sources.data?.sources ?? [];
  const langs = useMemo(() => [...new Set(all.map((s) => s.lang))].sort(), [all]);
  const shown = all.filter((source) => !lang || source.lang === lang);

  return (
    <>
      <PageHeader title="Browse" description="See what a source lists, and add from there." />
      <BrowseTabs />
      {langs.length > 1 ? (
        <div className="mb-4 w-48">
          <NativeSelect
            aria-label="Language"
            value={lang ?? ""}
            onChange={(e) => void navigate({ search: e.target.value ? { lang: e.target.value } : {}, replace: true })}
          >
            <option value="">All languages</option>
            {langs.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      {sources.error ? <ErrorAlert error={sources.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.isPending ? <Loading /> : null}
      {sources.data && all.length === 0 ? (
        <EmptyState icon={<Library />} title="No sources">
          {isAdmin ? (
            <>
              Add a source plugin under{" "}
              <Link to="/admin/plugins" className="underline underline-offset-4">
                Admin → Plugins
              </Link>
              .
            </>
          ) : (
            "There are no sources you can use. Ask your admin."
          )}
        </EmptyState>
      ) : null}
      {shown.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((source) => (
            <li key={source.id}>
              <Link
                to="/browse/sources/$sourceId"
                params={{ sourceId: source.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <SourceIcon name={source.name} url={source.icon_url} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium [overflow-wrap:anywhere]">{source.name}</span>
                    <Badge variant="outline" className="uppercase">
                      {source.lang}
                    </Badge>
                  </p>
                  {source.health.status !== "ok" ? (
                    <HealthBadge status={source.health.status} className="mt-1" />
                  ) : null}
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
