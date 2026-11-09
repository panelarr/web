// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { LinkTabs } from "@/components/scroll-strip";

export const ADMIN_PAGES = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/plugins", label: "Plugins" },
  { to: "/admin/sources", label: "Sources" },
  { to: "/admin/updates", label: "Updates" },
  { to: "/admin/metadata", label: "Metadata" },
  { to: "/admin/storage", label: "Storage" },
  { to: "/admin/network", label: "Network" },
  { to: "/admin/jobs", label: "Jobs" },
  { to: "/admin/queue", label: "Queue" },
  { to: "/admin/health", label: "Health" },
] as const;

/** The admin area. The server enforces admin rights on every call; this only keeps users out of pages they can't use. */
export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (context.me.user.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <>
      <LinkTabs
        label="Admin"
        className="mb-6"
        tabs={ADMIN_PAGES.map((page) => ({ key: page.to, label: page.label, link: { to: page.to } }))}
      />
      <Outlet />
    </>
  );
}
