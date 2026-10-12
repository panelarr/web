// SPDX-License-Identifier: GPL-3.0-or-later

import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A row that scrolls sideways when it doesn't fit (tabs on a phone), bleeding to the screen's
 * edges there. Only sideways: `overflow-x: auto` alone would make the other axis scroll too,
 * and a pixel of overhang would show a vertical scrollbar where scrollbars are always visible.
 */
export function ScrollStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="scroll-strip"
      className={cn("-mx-4 scrollbar-thin overflow-x-auto overflow-y-hidden px-4 md:mx-0 md:px-0", className)}
    >
      {children}
    </div>
  );
}

const linkTab =
  "inline-block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground";

/**
 * Tabs that are links to separate pages (the current one marked by the router). The baseline is
 * an inset shadow under the tabs, so the active underline covers it without sticking out of the
 * strip.
 */
export function LinkTabs({
  label,
  tabs,
  className,
}: {
  label: string;
  tabs: ReadonlyArray<{ key: string; label: string; link: LinkProps & { activeOptions?: LinkProps["activeOptions"] } }>;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ScrollStrip>
        <ul className="flex min-w-max gap-1 shadow-[inset_0_-1px_0_var(--border)]">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link {...tab.link} className={linkTab}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </ScrollStrip>
    </nav>
  );
}
