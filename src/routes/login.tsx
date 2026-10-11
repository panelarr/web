// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { meQuery, safeRedirect, systemInfoQuery } from "@/auth/session";
import { AuthLayout } from "@/components/auth-layout";
import { formValues, TextField } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LoginSearch {
  redirect?: string;
  expired?: boolean;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
    ...(search.expired === true || search.expired === "true" ? { expired: true } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    const info = await context.queryClient.ensureQueryData(systemInfoQuery());
    if (info.setup_required) throw redirect({ to: "/setup" });
    // Already signed in: carry on where they were going.
    const me = await context.queryClient.fetchQuery(meQuery()).catch(() => undefined);
    if (me) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = $api.useMutation("post", "/auth/login", {
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ href: safeRedirect(search.redirect), replace: true });
    },
  });

  const error = login.error;
  const wrong = isApiError(error, "invalid_credentials");
  const limited = isApiError(error, "rate_limited");

  return (
    <AuthLayout title="Sign in to Panelarr">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const { username = "", password = "" } = formValues(event.currentTarget);
          login.mutate({ body: { username, password } });
        }}
      >
        {search.expired && !error ? (
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
        <TextField label="Username" name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" disabled={login.isPending} className="mt-2">
          {login.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
