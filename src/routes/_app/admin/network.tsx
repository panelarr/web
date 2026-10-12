// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId } from "react";
import { ScrollStrip } from "@/components/scroll-strip";
import { PageHeader } from "@/components/states";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalDefault, ProfilesPanel, ProxiesPanel, SolversPanel } from "@/features/network/network-panels";

const TABS = ["profiles", "proxies", "solvers"] as const;
type Tab = (typeof TABS)[number];

interface NetworkSearch {
  tab?: Tab;
  /** Also the ones made for one plugin, extension, source or provider. */
  custom?: true;
}

export const Route = createFileRoute("/_app/admin/network")({
  validateSearch: (search: Record<string, unknown>): NetworkSearch => ({
    ...(TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {}),
    ...(search.custom === true || search.custom === "true" ? { custom: true as const } : {}),
  }),
  component: NetworkPage,
});

/**
 * Panelarr's shared network services: solvers, proxies and the profiles built from them. They're
 * options: a plugin, extension, source or provider uses one only once an admin picks it there.
 */
function NetworkPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const customId = useId();
  const scope = { custom: search.custom === true };
  return (
    <>
      <PageHeader
        title="Network"
        description="Proxies, challenge solvers and the profiles built from them, shared with every plugin. Nothing uses one until it's chosen: here for everything, or on a plugin, an extension or a source."
      />
      <Tabs
        value={search.tab ?? "profiles"}
        onValueChange={(tab) =>
          void navigate({
            search: (prev) => ({ ...prev, tab: tab === "profiles" ? undefined : (tab as Tab) }),
            replace: true,
          })
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScrollStrip>
            <TabsList>
              <TabsTrigger value="profiles">Profiles</TabsTrigger>
              <TabsTrigger value="proxies">Proxies</TabsTrigger>
              <TabsTrigger value="solvers">Solvers</TabsTrigger>
            </TabsList>
          </ScrollStrip>
          <div className="flex items-center gap-2">
            <Checkbox
              id={customId}
              checked={scope.custom}
              onCheckedChange={(on) =>
                void navigate({
                  search: (prev) => ({ ...prev, custom: on === true ? true : undefined }),
                  replace: true,
                })
              }
            />
            <Label htmlFor={customId} className="font-normal">
              Show custom ones too
            </Label>
          </div>
        </div>
        <TabsContent value="profiles" className="mt-4 grid gap-4">
          <GlobalDefault />
          <ProfilesPanel scope={scope} />
        </TabsContent>
        <TabsContent value="proxies" className="mt-4">
          <ProxiesPanel scope={scope} />
        </TabsContent>
        <TabsContent value="solvers" className="mt-4">
          <SolversPanel scope={scope} />
        </TabsContent>
      </Tabs>
    </>
  );
}
