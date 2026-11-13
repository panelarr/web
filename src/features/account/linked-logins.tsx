// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import {
  authMethodsQuery,
  browser,
  type Identity,
  isWebUrl,
  providerName,
  serverPath,
  ssoErrorMessage,
} from "@/auth/sso";
import { ErrorAlert, Loading } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRelative } from "@/lib/format";

/** Linked single sign-on logins, as rows with Unlink. Shared by the account page and an admin's user page. */
export function IdentityRows({
  identities,
  onUnlink,
  unlinking,
}: {
  identities: Identity[];
  onUnlink: (identity: Identity) => void;
  unlinking: boolean;
}) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Linked logins">
      {identities.map((identity) => (
        <li key={identity.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
          <KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-medium [overflow-wrap:anywhere]">{providerName(identity.issuer)}</p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {[
                identity.email || null,
                `linked ${formatDate(identity.created_at)}`,
                identity.last_login_at ? `last used ${formatRelative(identity.last_login_at)}` : "never used",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={unlinking} onClick={() => onUnlink(identity)}>
            Unlink
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Whether single sign-on is configured; nothing about it shows otherwise. */
export function useSsoEnabled(): boolean {
  return !!useQuery(authMethodsQuery()).data?.oidc;
}

/** Where linking sends the browser back to, marked so the page can say it worked. */
const LINK_RETURN = "/settings?tab=security&sso=linked";

/**
 * Settings → Security: the user's linked single sign-on logins, Unlink, and Link SSO login. The
 * provider sends the browser back here, with `sso_error` when linking failed.
 */
export function LinkedLoginsCard({ ssoError, linked }: { ssoError: string | undefined; linked: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const identitiesKey = $api.queryOptions("get", "/me/identities").queryKey;
  const identities = $api.useQuery("get", "/me/identities");
  // What the provider's return said, kept after it's taken out of the address.
  const [returned, setReturned] = useState<string | undefined>(ssoError);
  const announced = useRef(false);
  useEffect(() => {
    if (ssoError === undefined && !linked) return;
    if (ssoError !== undefined) setReturned(ssoError);
    else if (!announced.current) toast.success("Single sign-on login linked.");
    announced.current = true;
    void navigate({ to: "/settings", search: { tab: "security" }, replace: true });
  }, [ssoError, linked, navigate]);

  const link = $api.useMutation("post", "/auth/oidc/link", {
    onSuccess: (data) => {
      if (isWebUrl(data.redirect_to)) browser.assign(data.redirect_to);
    },
  });
  const unlink = $api.useMutation("delete", "/me/identities/{id}", {
    onSuccess: () => {
      toast.success("Login unlinked.");
      void queryClient.invalidateQueries({ queryKey: identitiesKey });
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/me").queryKey });
    },
  });
  const lastMethod = isApiError(unlink.error, "last_login_method");
  const list = identities.data?.identities;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked logins</CardTitle>
        <CardDescription>Sign in with single sign-on through these logins at your identity provider.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {returned !== undefined ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Not linked</AlertTitle>
            <AlertDescription>{ssoErrorMessage(returned)}</AlertDescription>
          </Alert>
        ) : null}
        {lastMethod ? (
          <p role="alert" className="text-sm text-destructive">
            This is your only way to sign in. Set a password first, then unlink it.
          </p>
        ) : unlink.error ? (
          <ErrorAlert error={unlink.error} />
        ) : null}
        {link.error ? <ErrorAlert error={link.error} title="Couldn't start linking" /> : null}
        {identities.error ? <ErrorAlert error={identities.error} onRetry={() => void identities.refetch()} /> : null}
        {identities.isPending ? <Loading /> : null}
        {list && list.length > 0 ? (
          <IdentityRows
            identities={list}
            unlinking={unlink.isPending}
            onUnlink={(identity) => unlink.mutate({ params: { path: { id: identity.id } } })}
          />
        ) : list ? (
          <p className="text-sm text-muted-foreground">No login is linked yet.</p>
        ) : null}
        {list && list.length === 0 ? (
          <div>
            <Button
              disabled={link.isPending || link.isSuccess}
              onClick={() => {
                setReturned(undefined);
                link.mutate({ body: { return_to: serverPath(LINK_RETURN) } });
              }}
            >
              {link.isPending || link.isSuccess ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Link SSO login
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
