// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { formValues, PasswordConfirm, TextField } from "@/components/form";
import { ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { describeUserAgent } from "@/lib/user-agent";

export function PasswordCard() {
  const queryClient = useQueryClient();
  const [mismatch, setMismatch] = useState(false);
  const change = $api.useMutation("post", "/me/password", {
    onSuccess: (_data, _vars) => {
      toast.success("Password changed. Your other sessions were signed out.");
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/me/sessions").queryKey });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs out every other session.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-md gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const { current_password = "", password = "", confirm = "" } = formValues(form);
            setMismatch(password !== confirm);
            if (password !== confirm) return;
            change.mutate({ body: { current_password, new_password: password } }, { onSuccess: () => form.reset() });
          }}
        >
          {isApiError(change.error, "invalid_credentials") ? (
            <p role="alert" className="text-sm text-destructive">
              The current password is wrong.
            </p>
          ) : change.error && !isApiError(change.error, "invalid_request") ? (
            <ErrorAlert error={change.error} />
          ) : null}
          <TextField
            label="Current password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
          />
          <TextField
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            hint="At least 8 characters."
            error={change.error}
          />
          <PasswordConfirm mismatch={mismatch} label="Repeat the new password" />
          <div>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = $api.useQuery("get", "/me/sessions");
  const end = $api.useMutation("delete", "/me/sessions/{id}", {
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/me/sessions").queryKey }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Where you're signed in. Sign out anything you don't recognise.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.error ? <ErrorAlert error={sessions.error} onRetry={() => void sessions.refetch()} /> : null}
        {end.error ? <ErrorAlert error={end.error} /> : null}
        {sessions.isPending ? <Loading /> : null}
        {sessions.data ? (
          <ul className="divide-y rounded-lg border">
            {sessions.data.sessions.map((session) => {
              const mobile = /iPhone|iPad|Android|Mobile/.test(session.user_agent ?? "");
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">
                      {describeUserAgent(session.user_agent)}
                      {session.current ? (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          This device
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {session.ip ? `${session.ip} · ` : ""}active {formatRelative(session.last_seen_at)}
                    </p>
                  </div>
                  {session.current ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={end.isPending}
                      onClick={() => end.mutate({ params: { path: { id: session.id } } })}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
