// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

export const ADMIN_PAGES = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/plugins", label: "Plugins" },
  { to: "/admin/sources", label: "Sources" },
  { to: "/admin/storage", label: "Storage" },
  { to: "/admin/jobs", label: "Jobs" },
  { to: "/admin/queue", label: "Queue" },
  { to: "/admin/system", label: "System" },
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
      <nav aria-label="Admin" className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1">
          {ADMIN_PAGES.map((page) => (
            <li key={page.to}>
              <Link
                to={page.to}
                className="-mb-px inline-block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
