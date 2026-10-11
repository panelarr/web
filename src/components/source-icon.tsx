// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import { cn } from "@/lib/utils";

/** A source's icon from the server, or its first letter when there is none. */
export function SourceIcon({ name, url, className }: { name: string; url?: string | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = cn("size-8 shrink-0 rounded-md", className);
  if (!url || failed) {
    return (
      <span
        aria-hidden
        className={cn(box, "flex items-center justify-center bg-muted text-sm font-semibold text-muted-foreground")}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" className={cn(box, "object-cover")} onError={() => setFailed(true)} />;
}
