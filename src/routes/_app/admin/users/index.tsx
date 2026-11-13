// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Link2, Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { displayName } from "@/auth/session";
import { ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-menu";
import { useSsoEnabled } from "@/features/account/linked-logins";
import { ratingLabel } from "@/features/admin/grants";
import { AddUserDialog, InviteDialog } from "@/features/admin/user-dialogs";
import { formatRelative } from "@/lib/format";

type User = components["schemas"]["User"];

export const Route = createFileRoute("/_app/admin/users/")({
  component: UsersPage,
});

function UsersPage() {
  const users = $api.useQuery("get", "/users");
  const sso = useSsoEnabled();
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in, and what they may do."
        actions={
          <>
            <Button variant="outline" onClick={() => setInviting(true)}>
              <Link2 aria-hidden />
              Invite
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add user
            </Button>
          </>
        }
      />
      {users.error ? <ErrorAlert error={users.error} onRetry={() => void users.refetch()} /> : null}
      {users.isPending ? <Loading /> : null}
      {users.data ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {users.data.users.map((user) => (
            <UserRow key={user.id} user={user} sso={sso} />
          ))}
        </ul>
      ) : null}
      <OpenInvites />
      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </>
  );
}

function UserRow({ user, sso }: { user: User; sso: boolean }) {
  const g = user.grants;
  return (
    <li>
      <Link
        to="/admin/users/$userId"
        params={{ userId: user.id }}
        className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
      >
        <UserAvatar name={displayName(user)} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium [overflow-wrap:anywhere]">{displayName(user)}</span>
            {user.display_name ? <span className="text-sm text-muted-foreground">{user.username}</span> : null}
            {user.role === "admin" ? <Badge>Admin</Badge> : null}
            {user.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
            {sso && user.sso ? (
              <Badge variant="outline" title="A single sign-on login is linked">
                SSO
              </Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {user.role === "admin"
              ? "May do everything"
              : [
                  g.may_add ? "adds works" : "can't add",
                  g.may_download ? "downloads" : "no downloads",
                  g.may_manage_matches ? "fixes matches" : null,
                  `up to ${ratingLabel(g.content_rating_ceiling).toLowerCase()}`,
                  g.all_sources ? "all sources" : `${g.allowed_sources.length} sources`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
            {user.last_login_at ? ` · seen ${formatRelative(user.last_login_at)}` : " · never signed in"}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function OpenInvites() {
  const queryClient = useQueryClient();
  const invites = $api.useQuery("get", "/invites");
  const revoke = $api.useMutation("delete", "/invites/{id}", {
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/invites").queryKey }),
  });
  if (!invites.data || invites.data.invites.length === 0) return null;
  return (
    <section aria-labelledby="open-invites" className="mt-8">
      <h2 id="open-invites" className="mb-3 text-lg font-semibold">
        Open invites
      </h2>
      {revoke.error ? <ErrorAlert error={revoke.error} /> : null}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {invites.data.invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
            <UserPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium [overflow-wrap:anywhere]">{invite.note || "Invite"}</p>
              <p className="text-xs text-muted-foreground">
                {invite.role === "admin" ? "Admin" : "User"} · expires {formatRelative(invite.expires_at)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate({ params: { path: { id: invite.id } } })}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
