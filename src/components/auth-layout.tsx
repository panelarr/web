// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import icon from "@/assets/panelarr-icon.svg";
import { cn } from "@/lib/utils";

/** The frame of the pages before signing in: the logo above a centred panel. */
export function AuthLayout({
  title,
  description,
  children,
  wide,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-gutter pt-safe pb-safe">
      <div className={cn("flex w-full flex-1 flex-col justify-center py-10", wide ? "max-w-2xl" : "max-w-sm")}>
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src={icon} alt="" width={56} height={56} />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
