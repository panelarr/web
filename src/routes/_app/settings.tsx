// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ssoErrorParam } from "@/auth/sso";
import { ScrollStrip } from "@/components/scroll-strip";
import { PageHeader } from "@/components/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysCard } from "@/features/account/api-keys-card";
import { AppearanceCard } from "@/features/account/appearance-card";
import { LinkedLoginsCard, useSsoEnabled } from "@/features/account/linked-logins";
import { ProfileCard } from "@/features/account/profile-card";
import { PasswordCard, SessionsCard } from "@/features/account/security-cards";
import { ImportsCard } from "@/features/imports/imports-card";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API keys" },
  { id: "appearance", label: "Appearance" },
  { id: "import", label: "Import" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface SettingsSearch {
  tab?: Tab;
  /** Back from the identity provider after linking a login: it worked, or why not. */
  sso?: "linked";
  sso_error?: string;
}

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const ssoError = ssoErrorParam(search.sso_error);
    return {
      ...(TABS.some((t) => t.id === search.tab) ? { tab: search.tab as Tab } : {}),
      ...(search.sso === "linked" ? { sso: "linked" as const } : {}),
      ...(ssoError !== undefined ? { sso_error: ssoError } : {}),
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  // The selected tab comes from the URL's search params (never from link matching), so
  // exactly one tab is selected and the address can be shared or bookmarked.
  const search = Route.useSearch();
  const tab = search.tab ?? "profile";
  const navigate = useNavigate({ from: Route.fullPath });
  const sso = useSsoEnabled();
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
          {sso ? <LinkedLoginsCard ssoError={search.sso_error} linked={search.sso === "linked"} /> : null}
          <SessionsCard />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysCard />
        </TabsContent>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceCard />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportsCard />
        </TabsContent>
      </Tabs>
    </>
  );
}
