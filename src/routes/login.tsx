// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { clearSessionHint, hasSessionHint, meQuery, safeRedirect, systemInfoQuery } from "@/auth/session";
import { authMethodsQuery, PASSWORD_ONLY, ssoErrorMessage, ssoErrorParam, ssoStartUrl } from "@/auth/sso";
import { AuthLayout } from "@/components/auth-layout";
import { formValues, TextField } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LoginSearch {
  redirect?: string;
  expired?: boolean;
  /** Why single sign-on failed: the server sends the browser back here with a code. */
  sso_error?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
    ...(search.expired === true || search.expired === "true" ? { expired: true } : {}),
    ...(ssoErrorParam(search.sso_error) !== undefined ? { sso_error: ssoErrorParam(search.sso_error) } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    const info = await context.queryClient.ensureQueryData(systemInfoQuery());
    if (info.setup_required) throw redirect({ to: "/setup" });
    // Known before the page shows, so it doesn't change shape; a failure means passwords only.
    await context.queryClient.ensureQueryData(authMethodsQuery()).catch(() => undefined);
    // Already signed in: carry on where they were going (only asked when a session is likely).
    if (!hasSessionHint()) return;
    const me = await context.queryClient.fetchQuery(meQuery()).catch(() => {
      clearSessionHint();
      return undefined;
    });
    if (me) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // A server that can't say (an older one, or a failure) still lets everyone use a password.
  const methods = useQuery(authMethodsQuery()).data ?? PASSWORD_ONLY;
  const [passwordShown, setPasswordShown] = useState(false);
  const sso = methods.oidc;
  const adminsOnly = methods.password === "admins";
  const ssoError = search.sso_error;
  const startUrl = ssoStartUrl({ returnTo: safeRedirect(search.redirect) });
  const usePassword = () => {
    setPasswordShown(true);
    if (ssoError !== undefined) {
      const { sso_error: _gone, ...rest } = search;
      void navigate({ search: rest, replace: true });
    }
  };
  const formShown = !sso || !adminsOnly || passwordShown;

  return (
    <AuthLayout title="Sign in to Panelarr">
      <div className="grid gap-6">
        {ssoError !== undefined ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Single sign-on didn't work</AlertTitle>
            <AlertDescription>
              <p>{ssoErrorMessage(ssoError)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sso ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={startUrl}>Try again</a>
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={usePassword}>
                  Use a password
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {sso ? (
          <Button asChild size="lg">
            {/* A navigation, not an API call: the server sends the browser on to the identity provider. */}
            <a href={startUrl}>
              <KeyRound aria-hidden />
              {sso.label}
            </a>
          </Button>
        ) : null}
        {formShown ? (
          <>
            {sso ? <OrDivider /> : null}
            {sso && adminsOnly ? (
              <p className="-mt-2 text-center text-sm text-muted-foreground">
                Password sign-in is for admins. Everyone else signs in with single sign-on.
              </p>
            ) : null}
            <PasswordForm
              redirectTo={search.redirect}
              expired={search.expired === true}
              autoFocus={!sso || passwordShown}
            />
          </>
        ) : ssoError === undefined ? (
          // With an error, its own Use a password stands in for this one.
          <Button variant="ghost" onClick={usePassword}>
            Use a password
          </Button>
        ) : null}
      </div>
    </AuthLayout>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function PasswordForm({
  redirectTo,
  expired,
  autoFocus,
}: {
  redirectTo: string | undefined;
  expired: boolean;
  autoFocus: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = $api.useMutation("post", "/auth/login", {
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ href: safeRedirect(redirectTo), replace: true });
    },
  });

  const error = login.error;
  const wrong = isApiError(error, "invalid_credentials");
  const limited = isApiError(error, "rate_limited");

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const { username = "", password = "" } = formValues(event.currentTarget);
        login.mutate({ body: { username, password } });
      }}
    >
      {expired && !error ? (
        <Alert>
          <AlertDescription>Your session ended. Sign in again to continue.</AlertDescription>
        </Alert>
      ) : null}
      {wrong ? (
        <p role="alert" className="text-sm text-destructive">
          Wrong username or password.
        </p>
      ) : limited ? (
        <p role="alert" className="text-sm text-destructive">
          Too many attempts. Try again
          {isApiError(error) && error.retryAfter ? ` in ${error.retryAfter} seconds` : " in a moment"}.
        </p>
      ) : error ? (
        <ErrorAlert error={error} />
      ) : null}
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        required
        autoFocus={autoFocus}
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" variant={autoFocus ? "default" : "outline"} disabled={login.isPending} className="mt-2">
        {login.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Sign in
      </Button>
    </form>
  );
}
