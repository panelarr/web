// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { ErrorAlert } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/features/admin/health-badge";

type OidcStatus = components["schemas"]["OidcStatus"];

/**
 * Admin → Health: how single sign-on is configured, read-only (the server's environment sets it,
 * never the app), and whether the identity provider answers. Shown only when it's on.
 */
export function SignInCard({ pollMs }: { pollMs: number }) {
  const auth = $api.useQuery("get", "/system/auth", {}, { refetchInterval: pollMs });
  // A server from before single sign-on has no such endpoint: nothing to show.
  if (isApiError(auth.error, "not_found")) return null;
  if (auth.error) {
    return (
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Single sign-on</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorAlert error={auth.error} onRetry={() => void auth.refetch()} />
        </CardContent>
      </Card>
    );
  }
  const oidc = auth.data?.oidc;
  if (!auth.data || !oidc?.enabled) return null;
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Single sign-on
          <HealthBadge status={oidc.reachable ? "ok" : "failing"} />
        </CardTitle>
        <CardDescription>Set by the server's configuration; change it there.</CardDescription>
      </CardHeader>
      <CardContent>
        {!oidc.reachable ? (
          <p role="alert" className="mb-3 text-sm text-destructive [overflow-wrap:anywhere]">
            The identity provider can't be reached{oidc.error ? `: ${oidc.error}` : "."} Passwords still work.
          </p>
        ) : null}
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" aria-label="Single sign-on settings">
          <Row label="Issuer">{oidc.issuer}</Row>
          <Row label="Client">{clientLabel(oidc)}</Row>
          <Row label="Button">{oidc.button_label}</Row>
          <Row label="Scopes">{oidc.scopes?.join(" ")}</Row>
          <Row label="Claims">
            {[
              oidc.username_claim ? `username from ${oidc.username_claim}` : null,
              oidc.groups_claim ? `groups from ${oidc.groups_claim}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </Row>
          <Row label="New users">{oidc.auto_provision ? "Created at their first sign-in" : "Only through invites"}</Row>
          <Row label="Allowed groups">{listOr(oidc.allowed_groups, "Anyone at the provider")}</Row>
          <Row label="Admin groups">{listOr(oidc.admin_groups, "None: roles are set in Panelarr")}</Row>
          <Row label="Passwords">{auth.data.password === "admins" ? "Admins only" : "Everyone"}</Row>
          <Row label="Sign out">{oidc.logout === "provider" ? "Here and at the provider" : "Here only"}</Row>
        </dl>
      </CardContent>
    </Card>
  );
}

function clientLabel(oidc: OidcStatus): string | undefined {
  if (!oidc.client_id) return undefined;
  return oidc.public_client ? `${oidc.client_id} (public, no secret)` : oidc.client_id;
}

function listOr(items: string[] | undefined, none: string): string {
  return items && items.length > 0 ? items.join(", ") : none;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{children || "—"}</dd>
    </>
  );
}
