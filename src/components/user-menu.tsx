// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { displayName, useMe } from "@/auth/session";
import { useSignOut } from "@/auth/use-sign-out";
import { InstallApp, InstallIcon } from "@/components/install-app";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : name.slice(0, 2);
  return letters.toUpperCase();
}

export function UserAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-8">
      <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The signed-in user, with their settings and sign-out (desktop sidebar). */
export function UserMenu() {
  const { user } = useMe();
  const { signOut } = useSignOut();
  const name = displayName(user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-2">
        <UserAvatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {user.role === "admin" ? "Admin" : "User"}
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <InstallApp
          render={({ onClick }) => (
            <DropdownMenuItem onSelect={onClick}>
              <InstallIcon aria-hidden />
              Install the app
            </DropdownMenuItem>
          )}
        />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
