// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ScrollStrip } from "@/components/scroll-strip";
import { PageHeader } from "@/components/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysCard } from "@/features/account/api-keys-card";
import { AppearanceCard } from "@/features/account/appearance-card";
import { ProfileCard } from "@/features/account/profile-card";
import { PasswordCard, SessionsCard } from "@/features/account/security-cards";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API keys" },
  { id: "appearance", label: "Appearance" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === search.tab) ? { tab: search.tab as Tab } : {},
  component: SettingsPage,
});

function SettingsPage() {
  // The selected tab comes from the URL's search params (never from link matching), so
  // exactly one tab is selected and the address can be shared or bookmarked.
  const tab = Route.useSearch().tab ?? "profile";
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(value) => void navigate({ search: { tab: value as Tab }, replace: true })}>
        <ScrollStrip>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollStrip>
        <TabsContent value="profile" className="mt-4">
          <ProfileCard />
        </TabsContent>
        <TabsContent value="security" className="mt-4 grid gap-6">
          <PasswordCard />
          <SessionsCard />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysCard />
        </TabsContent>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceCard />
        </TabsContent>
      </Tabs>
    </>
  );
}
