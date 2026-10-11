// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { NAV_ITEMS } from "@/components/nav";
import { PageHeader } from "@/components/states";

export const Route = createFileRoute("/_app/more")({
  component: MorePage,
});

/** On phones, the pages that don't fit in the bottom bar. */
function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {NAV_ITEMS.filter((item) => !item.primary).map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent">
              <item.icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
