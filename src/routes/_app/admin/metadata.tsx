// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ScrollStrip } from "@/components/scroll-strip";
import { PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type JobsSearch, JobsSection, jobsSearch } from "@/features/jobs/jobs-views";
import { metaJobs } from "@/features/jobs/service";
import { JobsContext, type JobsHost } from "@/features/jobs/use-jobs";
import { DuplicatesPanel, type DuplicatesSearch, duplicatesSearch } from "@/features/meta/duplicates-panel";
import { MetaHealthCard } from "@/features/meta/meta-health";
import { ProvidersPanel, type ProvidersSearch, providersSearch } from "@/features/meta/providers-panel";
import { MetaNetwork } from "@/features/network/meta-network";
import { MetaConnectionPanel } from "@/features/setup/meta-connection";

/** The metadata service's sections beyond its overview. */
const TABS = ["providers", "duplicates", "jobs", "network"] as const;
type MetaTab = (typeof TABS)[number];

interface MetadataSearch extends JobsSearch, ProvidersSearch, DuplicatesSearch {
  tab?: MetaTab;
}

export const Route = createFileRoute("/_app/admin/metadata")({
  validateSearch: (search: Record<string, unknown>): MetadataSearch => {
    const tab = TABS.includes(search.tab as MetaTab) ? (search.tab as MetaTab) : undefined;
    if (!tab) return {};
    if (tab === "jobs") return { tab, ...jobsSearch(search) };
    if (tab === "providers") return { tab, ...providersSearch(search) };
    if (tab === "duplicates") return { tab, ...duplicatesSearch(search) };
    return { tab };
  },
  component: MetadataPage,
});

const to = "/admin/metadata";

/** meta's jobs, through the server, inside this page's Jobs tab (?tab=jobs&job=…&run=…). */
const META_JOBS: JobsHost = {
  service: metaJobs,
  nested: true,
  links: {
    list: { to, search: { tab: "jobs" } },
    job: (job) => ({ to, search: { tab: "jobs", job } }),
    run: (job, run) => ({ to, search: { tab: "jobs", job, run } }),
  },
};

/**
 * The metadata service, administered from Panelarr: the server holds its admin key and passes
 * every call on, so the browser never talks to it directly.
 */
function MetadataPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader title="Metadata service" description="Where Panelarr finds works. The library needs it." />
      <Tabs
        value={search.tab ?? "overview"}
        onValueChange={(value) =>
          void navigate({ search: value === "overview" ? {} : { tab: value as MetaTab }, replace: true })
        }
      >
        <ScrollStrip>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
          </TabsList>
        </ScrollStrip>
        <TabsContent value="overview" className="mt-4 grid gap-6 lg:grid-cols-2">
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Connection</CardTitle>
              <CardDescription>Where the service is, the key Panelarr uses, and whether it's ready.</CardDescription>
            </CardHeader>
            <CardContent>
              <MetaConnectionPanel />
            </CardContent>
          </Card>
          <MetaHealthCard />
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <ProvidersPanel search={search} />
        </TabsContent>
        <TabsContent value="duplicates" className="mt-4">
          <DuplicatesPanel
            search={search}
            onSearch={(change) => void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })}
          />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <JobsContext value={META_JOBS}>
            <JobsSection
              search={search}
              onStatus={(status) => void navigate({ search: (prev) => ({ ...prev, status }), replace: true })}
            />
          </JobsContext>
        </TabsContent>
        <TabsContent value="network" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Network</CardTitle>
              <CardDescription>
                The proxy, solver and limits its providers use, from Panelarr's profiles. Nothing is chosen until you
                choose it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetaNetwork />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
