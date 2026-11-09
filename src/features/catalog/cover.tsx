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
  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-lg bg-muted", className)}>
      {/* Keyed by the URL: when a row is re-rendered in place for another series (the attached
          series after a pick, a list that changed), the image starts over. Changing an <img>'s
          src keeps the old picture on screen until the new one loads, which put one series'
          cover next to another's title. */}
      <CoverImage key={url ?? ""} url={url} title={title} eager={eager} />
    </div>
  );
}

function CoverImage({ url, title, eager }: { url?: string | undefined; title: string; eager?: boolean | undefined }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(url ? "loading" : "failed");
  return url && state !== "failed" ? (
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
  );
}
