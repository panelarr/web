// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { components } from "@/api/schema.gen";
import { Cover } from "./cover";
import { label, TYPE_LABELS } from "./labels";

type Summary = components["schemas"]["CatalogEntrySummary"];

/** A catalogue entry in a grid: cover, title, year and type. */
export function EntryCard({
  entry,
  matched,
  inLibrary,
}: {
  entry: Summary;
  matched?: string | undefined;
  inLibrary: boolean;
}) {
  return (
    <Link
      to="/catalog/$entryId"
      params={{ entryId: entry.id }}
      className="group flex min-w-0 flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <Cover url={entry.cover?.url} title={entry.title} className="transition-transform group-hover:scale-[1.02]" />
        {inLibrary ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow">
            <Check className="size-3" aria-hidden />
            In library
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-0.5">
        <p className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">{entry.title}</p>
        {matched ? <p className="truncate text-xs text-muted-foreground">“{matched}”</p> : null}
        <p className="truncate text-xs text-muted-foreground">
          {[entry.year, label(TYPE_LABELS, entry.type)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function EntryGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </ul>
  );
}
