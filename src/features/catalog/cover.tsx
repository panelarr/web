// SPDX-License-Identifier: GPL-3.0-or-later

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { serverUrl } from "@/lib/server-url";
import { cn } from "@/lib/utils";

/** A cover at the usual 2:3 shape, loaded lazily from the server. */
export function Cover({
  url,
  title,
  className,
  eager,
}: {
  url?: string | undefined;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(url ? "loading" : "failed");
  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-lg bg-muted", className)}>
      {url && state !== "failed" ? (
        <img
          src={serverUrl(url)}
          alt={`Cover of ${title}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-6" aria-label={`No cover for ${title}`} />
        </div>
      )}
    </div>
  );
}
