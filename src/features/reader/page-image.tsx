// SPDX-License-Identifier: GPL-3.0-or-later

import { ImageOff, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { serverUrl } from "@/lib/server-url";
import { cn } from "@/lib/utils";
import type { Fit } from "./settings";

/** One page image: a spinner while it loads, and a retry when it fails. */
export function PageImage({
  url,
  index,
  fit,
  stretch,
  eager,
  onSize,
  className,
  placeholderHeight,
  placeholderWidth,
  hold = false,
  known = false,
  onSettled,
}: {
  url: string;
  index: number;
  fit: Fit;
  stretch: boolean;
  eager?: boolean;
  /** Its natural size, once loaded (for long strips and spreads). */
  onSize?: (size: { width: number; height: number }) => void;
  className?: string;
  /** Space kept while loading (CSS length), so a long strip doesn't jump. */
  placeholderHeight?: string;
  /** Width kept while loading, for pages side by side. */
  placeholderWidth?: string;
  /**
   * Not to be fetched yet (pages load in order in a long strip): only its space is kept. Once a
   * page has started loading it keeps its image even if this turns on again: taking it away
   * would collapse its space and move everything after it.
   */
  hold?: boolean;
  /** Seen before (its size is known): shown at once when it comes back, without the loading fade. */
  known?: boolean;
  /** Called once it has loaded or failed. */
  onSettled?: () => void;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(known ? "loaded" : "loading");
  const [attempt, setAttempt] = useState(0);
  // Held until it may load, then never held again (see `hold`).
  const [released, setReleased] = useState(!hold);
  if (!hold && !released) setReleased(true);
  return (
    <div
      className={cn(
        "relative flex min-h-24 w-full items-center justify-center",
        fit === "screen" && "h-full",
        className,
      )}
      style={
        state === "loaded"
          ? undefined
          : {
              ...(placeholderHeight ? { minHeight: placeholderHeight } : {}),
              ...(placeholderWidth ? { minWidth: placeholderWidth } : {}),
            }
      }
    >
      {!released ? null : state !== "failed" ? (
        <img
          key={attempt}
          src={serverUrl(url)}
          alt={`Page ${index + 1}`}
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={(event) => {
            setState("loaded");
            onSize?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
            onSettled?.();
          }}
          onError={() => {
            setState("failed");
            onSettled?.();
          }}
          className={cn(
            "block select-none",
            fit === "screen" && (stretch ? "h-full w-full object-contain" : "max-h-full max-w-full object-contain"),
            fit === "width" && (stretch ? "mx-auto w-full" : "mx-auto max-w-full"),
            fit === "height" && (stretch ? "h-full w-auto max-w-none" : "max-h-full w-auto max-w-none"),
            fit === "original" && "mx-auto max-w-none",
            state === "loading" && "opacity-0",
          )}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <ImageOff className="size-8" aria-hidden />
          <p>Page {index + 1} didn't load.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState("loading");
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>
      )}
      {state === "loading" ? (
        <Loader2
          className="absolute size-6 animate-spin text-muted-foreground"
          aria-label={`Loading page ${index + 1}`}
        />
      ) : null}
    </div>
  );
}
