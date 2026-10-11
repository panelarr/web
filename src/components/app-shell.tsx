// SPDX-License-Identifier: GPL-3.0-or-later

import { Link, useRouterState } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { $api } from "@/api/client";
import { useIsAdmin } from "@/auth/session";
import { HealthBanner } from "@/components/health-banner";
import { Logo } from "@/components/logo";
import { NAV_ITEMS, type NavItem } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { usePreferencesSync } from "@/theme/sync";

/** The navigation items this user may see. */
export function useNavItems(): readonly NavItem[] {
  const isAdmin = useIsAdmin();
  return NAV_ITEMS.filter((item) => isAdmin || !item.admin);
}

/**
 * The frame around every signed-in page. Desktop and tablets get a sidebar; phones get a top
 * bar and a bottom navigation bar, like a native app.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  usePreferencesSync();
  return (
    <div className="min-h-dvh md:pl-60">
      <Sidebar />
      <MobileTopBar />
      <main
        className={cn(
          "mx-auto w-full max-w-7xl px-gutter pt-4 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1rem)]",
          "md:px-8 md:pt-8 md:pb-8",
        )}
      >
        {isAdmin ? <HealthBanner /> : null}
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

const sidebarLink =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground";

function Sidebar() {
  const items = useNavItems();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar pt-safe pl-safe md:flex">
      <div className="flex h-14 items-center px-5">
        <Link to="/" aria-label="Panelarr home">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className={sidebarLink}>
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
        <ServerVersion className="px-2 pt-2" />
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 pt-safe backdrop-blur md:hidden">
      <div className="flex h-[var(--app-bar-h)] items-center px-gutter">
        <Link to="/" aria-label="Panelarr home">
          <Logo size={24} />
        </Link>
      </div>
    </header>
  );
}

const bottomLink =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground data-[status=active]:text-primary";

function BottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // "More" stays highlighted on the pages it leads to.
  const items = useNavItems();
  const inMore = items.some((item) => !item.primary && pathname.startsWith(item.to));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-safe backdrop-blur md:hidden"
    >
      <div className="flex h-[var(--bottom-nav-h)] items-stretch pl-safe pr-safe">
        {items
          .filter((item) => item.primary)
          .map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className={bottomLink}>
              <item.icon className="size-5" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        <Link to="/more" className={bottomLink} {...(inMore ? { "data-status": "active" } : {})}>
          <Ellipsis className="size-5" aria-hidden />
          <span>More</span>
        </Link>
      </div>
    </nav>
  );
}

function ServerVersion({ className }: { className?: string }) {
  const info = $api.useQuery("get", "/system/info", {}, { staleTime: Number.POSITIVE_INFINITY });
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {info.data ? `Server ${info.data.version}` : info.isError ? "Server unreachable" : " "}
    </p>
  );
}
