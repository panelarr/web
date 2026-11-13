// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { tokenFromHash } from "@/auth/invite-link";
import { authMethodsQuery, ssoStartUrl } from "@/auth/sso";
import { AuthLayout } from "@/components/auth-layout";
import { formValues, PasswordConfirm, TextField } from "@/components/form";
import { ErrorAlert, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
});

function InvitePage() {
  // Read once: the fragment isn't part of the router's state.
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const check = $api.useQuery("post", "/auth/invites/check", { body: { token: token ?? "" } }, { enabled: !!token });

  if (!token || isApiError(check.error, "invite_invalid")) {
    return (
      <AuthLayout title="This invite doesn't work" description="It may be used up, expired or mistyped.">
        <p className="text-center text-sm text-muted-foreground">
          Ask your Panelarr admin for a new invite link, or{" "}
          <Link to="/login" className="underline underline-offset-4">
            sign in
          </Link>{" "}
          if you have an account.
        </p>
      </AuthLayout>
    );
  }
  if (check.error) {
    return (
      <AuthLayout title="Join Panelarr">
        <ErrorAlert error={check.error} onRetry={() => void check.refetch()} />
      </AuthLayout>
    );
  }
  if (!check.data) {
    return (
      <AuthLayout title="Join Panelarr">
        <Loading label="Checking your invite…" />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Join Panelarr"
      description={`You're invited${check.data.role === "admin" ? " as an admin" : ""}. The invite is valid until ${formatDateTime(check.data.expires_at)}.`}
    >
      <div className="grid gap-6">
        <AcceptWithSso token={token} />
        <AcceptForm token={token} />
      </div>
    </AuthLayout>
  );
}

/**
 * With single sign-on, the invite can be accepted by signing in at the identity provider: the
 * server creates the account with the invite's role and permissions and links that login.
 */
function AcceptWithSso({ token }: { token: string }) {
  const methods = useQuery(authMethodsQuery());
  if (!methods.data?.oidc) return null;
  return (
    <>
      <Button asChild size="lg">
        {/* A navigation: the server sends the browser on to the identity provider. */}
        <a href={ssoStartUrl({ invite: token })}>
          <KeyRound aria-hidden />
          Accept with SSO
        </a>
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden />
        or choose a username and password
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
    </>
  );
}

function AcceptForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mismatch, setMismatch] = useState(false);
  const accept = $api.useMutation("post", "/auth/invites/accept", {
    onSuccess: async () => {
      // The token is used up: drop it from the address bar and history.
      window.history.replaceState(null, "", window.location.pathname);
      queryClient.clear();
      await navigate({ to: "/", replace: true });
    },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const { username = "", password = "", confirm = "", display_name = "" } = formValues(event.currentTarget);
        setMismatch(password !== confirm);
        if (password !== confirm) return;
        accept.mutate({ body: { token, username, password, ...(display_name ? { display_name } : {}) } });
      }}
    >
      {accept.error && !isApiError(accept.error, "invalid_request") ? <ErrorAlert error={accept.error} /> : null}
      <TextField
        label="Username"
        name="username"
        error={accept.error}
        autoComplete="username"
        autoCapitalize="none"
        required
        minLength={2}
        maxLength={64}
        pattern="[A-Za-z0-9][A-Za-z0-9._\-]*"
        hint="Letters, digits, dots, dashes and underscores."
      />
      <TextField label="Display name" name="display_name" error={accept.error} maxLength={100} hint="Optional." />
      <TextField
        label="Password"
        name="password"
        type="password"
        error={accept.error}
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={256}
        hint="At least 8 characters."
      />
      <PasswordConfirm mismatch={mismatch} />
      <Button type="submit" disabled={accept.isPending} className="mt-2">
        {accept.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Create account
      </Button>
    </form>
  );
}
