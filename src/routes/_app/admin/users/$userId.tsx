// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { displayName, useMe } from "@/auth/session";
import { Field, formValues, PasswordConfirm, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { IdentityRows, useSsoEnabled } from "@/features/account/linked-logins";
import { type Grants, grantsPatch, type Role } from "@/features/admin/grants";
import { GrantsEditor } from "@/features/admin/grants-editor";
import { formatDateTime } from "@/lib/format";

type User = components["schemas"]["User"];

export const Route = createFileRoute("/_app/admin/users/$userId")({
  component: UserPage,
});

function useUserMutation(user: User, success: string) {
  const queryClient = useQueryClient();
  return $api.useMutation("patch", "/users/{id}", {
    onSuccess: (updated) => {
      queryClient.setQueryData(
        $api.queryOptions("get", "/users/{id}", { params: { path: { id: user.id } } }).queryKey,
        updated,
      );
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/users").queryKey });
      toast.success(success);
    },
  });
}

function UserPage() {
  const { userId } = Route.useParams();
  const user = $api.useQuery("get", "/users/{id}", { params: { path: { id: userId } } });
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link to="/admin/users">
          <ArrowLeft aria-hidden />
          Users
        </Link>
      </Button>
      {user.error ? <ErrorAlert error={user.error} onRetry={() => void user.refetch()} /> : null}
      {user.isPending ? <Loading /> : null}
      {user.data ? <UserDetails key={user.data.id} user={user.data} /> : null}
    </>
  );
}

function UserDetails({ user }: { user: User }) {
  const { user: me } = useMe();
  const self = me.id === user.id;
  const sso = useSsoEnabled();
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {displayName(user)}
            {user.role === "admin" ? <Badge>Admin</Badge> : null}
            {user.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
            {sso && user.sso ? <Badge variant="outline">SSO</Badge> : null}
          </span>
        }
        description={`${user.username} · added ${formatDateTime(user.created_at)}${
          user.last_login_at ? ` · last signed in ${formatDateTime(user.last_login_at)}` : ""
        }`}
        actions={self ? null : <DeleteUser user={user} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <AccountCard user={user} self={self} />
          <PasswordCard user={user} />
          {sso ? <IdentitiesCard user={user} /> : null}
        </div>
        <GrantsCard user={user} />
      </div>
    </>
  );
}

function AccountCard({ user, self }: { user: User; self: boolean }) {
  const [role, setRole] = useState<Role>(user.role);
  const [disabled, setDisabled] = useState(user.disabled);
  const update = useUserMutation(user, "Account saved.");
  const disabledId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        {self ? <CardDescription>You can't demote or disable yourself.</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const { display_name = "" } = formValues(event.currentTarget);
            update.mutate({
              params: { path: { id: user.id } },
              body: {
                ...(display_name !== user.display_name ? { display_name } : {}),
                ...(role !== user.role ? { role } : {}),
                ...(disabled !== user.disabled ? { disabled } : {}),
              },
            });
          }}
        >
          {update.error ? <ErrorAlert error={update.error} title="Not saved" /> : null}
          <TextField
            label="Display name"
            name="display_name"
            defaultValue={user.display_name}
            maxLength={100}
            error={update.error}
          />
          <Field label="Role">
            {(aria) => (
              <NativeSelect {...aria} value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </NativeSelect>
            )}
          </Field>
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor={disabledId}>Disabled</Label>
              <p className="text-xs text-muted-foreground">
                Signs them out and stops their API keys. Their library stays.
              </p>
            </div>
            <Switch id={disabledId} checked={disabled} disabled={self} onCheckedChange={setDisabled} />
          </div>
          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function GrantsCard({ user }: { user: User }) {
  const [grants, setGrants] = useState<Grants>(user.grants);
  const update = useUserMutation(user, "Permissions saved.");
  const changed = Object.keys(grantsPatch(user.grants, grants)).length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>The server enforces these on every request.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {update.error ? <ErrorAlert error={update.error} title="Not saved" /> : null}
        <GrantsEditor value={grants} onChange={setGrants} isAdmin={user.role === "admin"} />
        <div>
          <Button
            disabled={!changed || update.isPending}
            onClick={() =>
              update.mutate({ params: { path: { id: user.id } }, body: { grants: grantsPatch(user.grants, grants) } })
            }
          >
            {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save permissions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard({ user }: { user: User }) {
  const [mismatch, setMismatch] = useState(false);
  const update = useUserMutation(user, "Password reset. They were signed out everywhere.");
  // Users created by single sign-on have no password until someone sets one.
  const none = user.has_password === false;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{none ? "Set a password" : "Reset password"}</CardTitle>
        <CardDescription>
          {none
            ? "They sign in with single sign-on and have no password. Setting one signs them out everywhere."
            : "Sets a new password and signs them out everywhere."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const { password = "", confirm = "" } = formValues(form);
            setMismatch(password !== confirm);
            if (password !== confirm) return;
            update.mutate({ params: { path: { id: user.id } }, body: { password } }, { onSuccess: () => form.reset() });
          }}
        >
          {update.error ? <ErrorAlert error={update.error} /> : null}
          <TextField
            label="New password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            error={update.error}
          />
          <PasswordConfirm mismatch={mismatch} />
          <div>
            <Button type="submit" variant="outline" disabled={update.isPending}>
              {none ? "Set password" : "Reset password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** The user's linked single sign-on logins; unlinking also ends their single sign-on sessions. */
function IdentitiesCard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const params = { params: { path: { id: user.id } } };
  const identities = $api.useQuery("get", "/users/{id}/identities", params);
  const unlink = $api.useMutation("delete", "/users/{id}/identities/{identity_id}", {
    onSuccess: () => {
      toast.success("Login unlinked. Their single sign-on sessions were ended.");
      for (const path of ["/users/{id}/identities", "/users/{id}"] as const) {
        void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", path, params).queryKey });
      }
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/users").queryKey });
    },
  });
  const list = identities.data?.identities;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked logins</CardTitle>
        <CardDescription>Their single sign-on logins. Unlinking ends their single sign-on sessions.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isApiError(unlink.error, "last_login_method") ? (
          <p role="alert" className="text-sm text-destructive">
            This is their only way to sign in. Set a password for them first, or disable the user.
          </p>
        ) : unlink.error ? (
          <ErrorAlert error={unlink.error} />
        ) : null}
        {identities.error ? <ErrorAlert error={identities.error} onRetry={() => void identities.refetch()} /> : null}
        {identities.isPending ? <Loading /> : null}
        {list && list.length > 0 ? (
          <IdentityRows
            identities={list}
            unlinking={unlink.isPending}
            onUnlink={(identity) => unlink.mutate({ params: { path: { id: user.id, identity_id: identity.id } } })}
          />
        ) : list ? (
          <p className="text-sm text-muted-foreground">No login is linked. They link one from their account page.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeleteUser({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = $api.useMutation("delete", "/users/{id}", {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/users").queryKey });
      toast.success(`${displayName(user)} was deleted.`);
      await navigate({ to: "/admin/users" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Not deleted."),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {displayName(user)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their account, sessions and API keys go. Works they added stay, since they're shared. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate({ params: { path: { id: user.id } } })}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
