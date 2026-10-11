// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TapZones } from "./settings";
import { type TapAction, tapAction } from "./tap-zones";

/** Keeps the screen on while reading, where the browser allows it. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    };
    if (!enabled || !nav.wakeLock) return;
    let lock: { release(): Promise<void> } | undefined;
    let active = true;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          if (active) lock = l;
          else void l.release();
        })
        .catch(() => {
          // Refused (battery saver, no permission): reading works anyway.
        });
    };
    take();
    // The browser drops the lock when the page is hidden; take it again on return.
    document.addEventListener("visibilitychange", take);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [enabled]);
}

export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  return { fullscreen, supported: typeof document !== "undefined" && !!document.fullscreenEnabled, toggle };
}

/** The average colour of an image's edges, as CSS: for a background that matches the page. */
export async function edgeColor(url: string): Promise<string | undefined> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    return undefined;
  }
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x !== 0 && y !== 0 && x !== size - 1 && y !== size - 1) continue;
      const i = (y * size + x) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  }
  return n > 0 ? `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})` : undefined;
}

const ZONE_STYLE: Record<TapAction, string> = {
  prev: "bg-sky-500/35",
  next: "bg-emerald-500/35",
  menu: "bg-transparent",
};
const ZONE_LABEL: Record<TapAction, string> = { prev: "Back", next: "Forward", menu: "Menu" };
const GRID = 12;

/** Where the tap zones are, shown for a moment after they change. */
export function TapZonePreview({ layout, flip }: { layout: TapZones; flip: boolean }) {
  const cells: TapAction[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) cells.push(tapAction(layout, (x + 0.5) / GRID, (y + 0.5) / GRID, flip));
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 grid animate-in fade-in"
      style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
      aria-hidden
      data-testid="tap-zone-preview"
    >
      {cells.map((action, i) => (
        <div key={i} className={cn(ZONE_STYLE[action])} />
      ))}
      <div className="absolute inset-x-0 bottom-24 flex justify-center gap-3 text-xs font-medium">
        {(["prev", "next"] as const).map((action) => (
          <span
            key={action}
            className={cn("rounded px-2 py-1 text-white", action === "prev" ? "bg-sky-600" : "bg-emerald-600")}
          >
            {ZONE_LABEL[action]}
          </span>
        ))}
      </div>
    </div>
  );
}
