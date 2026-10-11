// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { displayName, useMe } from "@/auth/session";
import { useSignOut } from "@/auth/use-sign-out";
import { useNavItems } from "@/components/app-shell";
import { PageHeader } from "@/components/states";
import { UserAvatar } from "@/components/user-menu";

export const Route = createFileRoute("/_app/more")({
  component: MorePage,
});

/** On phones, the pages that don't fit in the bottom bar. */
function MorePage() {
  const { user } = useMe();
  const { signOut, pending } = useSignOut();
  const items = useNavItems();
  return (
    <>
      <PageHeader title="More" />
      <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <UserAvatar name={displayName(user)} />
        <div className="min-w-0">
          <p className="truncate font-medium">{displayName(user)}</p>
          <p className="truncate text-xs text-muted-foreground">{user.username}</p>
        </div>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {items
          .filter((item) => !item.primary)
          .map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent">
                <item.icon className="size-5 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        <li>
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-destructive hover:bg-accent"
          >
            <LogOut className="size-5" aria-hidden />
            <span className="flex-1">Sign out</span>
          </button>
        </li>
      </ul>
    </>
  );
}
