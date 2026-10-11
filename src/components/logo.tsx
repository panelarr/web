// SPDX-License-Identifier: GPL-3.0-or-later

import icon from "@/assets/panelarr-icon.svg";
import { cn } from "@/lib/utils";

/** The Panelarr mark with the wordmark next to it. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src={icon} alt="" width={size} height={size} className="shrink-0" />
      <span className="text-lg font-bold tracking-tight">Panelarr</span>
    </span>
  );
}
