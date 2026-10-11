// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { PageImage } from "./page-image";
import type { ReaderSettings } from "./settings";
import { tapAction } from "./tap-zones";
import { clampPan, NO_ZOOM, toggleZoom, type ZoomState, zoomAt } from "./zoom";

const SWIPE_FRACTION = 0.18;
const SWIPE_VELOCITY = 0.45; // px per ms
const TAP_MOVE = 8;
const DOUBLE_TAP_MS = 250;
const SLIDE_MS = 240;

interface Pointer {
  x: number;
  y: number;
}

/**
 * Page by page. Slots: -1 is the start of the chapter (the way back), `pages.length` its end
 * (the way on); in between, the pages. A swipe follows the finger; pinch, double tap and
 * Ctrl+wheel zoom; taps go back, forward or open the menu, by the tap-zone layout.
 */
export function PagedViewer({
  urls,
  index,
  onIndexChange,
  settings,
  onMenu,
  renderStart,
  renderEnd,
  turn,
}: {
  urls: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  settings: ReaderSettings;
  onMenu: () => void;
  renderStart: () => ReactNode;
  renderEnd: () => ReactNode;
  /** A page turn asked for from outside (keyboard, buttons); `id` makes each request new. */
  turn?: { direction: "next" | "prev"; id: number } | undefined;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const transition = reducedMotion ? "none" : settings.transition;
  const rtl = settings.direction === "rtl";
  const [drag, setDrag] = useState(0);
  const [sliding, setSliding] = useState<"next" | "prev" | undefined>();
  const [zoom, setZoom] = useState<ZoomState>(NO_ZOOM);
  const [pinching, setPinching] = useState(false);
  // Right after a turn the track jumps back to the middle slot without animating.
  const [settling, setSettling] = useState(false);

  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<
    | {
        start: Pointer;
        at: number;
        mode: "tap" | "swipe" | "pan" | "pinch";
        last: Pointer;
        distance?: number;
      }
    | undefined
  >(undefined);
  const lastTap = useRef<{ at: number; x: number; y: number } | undefined>(undefined);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const min = -1;
  const max = urls.length;
  // A new page starts unzoomed, and the track settles without animating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on page change only
  useEffect(() => {
    setZoom(NO_ZOOM);
    const frame = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const go = (direction: "next" | "prev") => {
    const target = direction === "next" ? index + 1 : index - 1;
    if (target < min || target > max) {
      setDrag(0);
      return;
    }
    if (transition === "slide") setSliding(direction);
    else onIndexChange(target);
  };

  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (turn) goRef.current(turn.direction);
  }, [turn]);

  const sizes = () => {
    const v = viewport.current?.getBoundingClientRect();
    const c = content.current;
    return {
      viewport: { width: v?.width ?? 1, height: v?.height ?? 1 },
      content: { width: c?.offsetWidth ?? 1, height: c?.offsetHeight ?? 1 },
      origin: { left: v?.left ?? 0, top: v?.top ?? 0 },
    };
  };

  const onTap = (point: Pointer) => {
    const { viewport: v, origin } = sizes();
    const x = point.x - origin.left;
    const y = point.y - origin.top;
    const last = lastTap.current;
    if (last && Date.now() - last.at < DOUBLE_TAP_MS && Math.hypot(last.x - x, last.y - y) < 40) {
      clearTimeout(tapTimer.current);
      lastTap.current = undefined;
      const s = sizes();
      setZoom((z) => toggleZoom(z, { x, y }, s.content, s.viewport));
      return;
    }
    lastTap.current = { at: Date.now(), x, y };
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      // While zoomed, a single tap only toggles the menu: the edges are for panning.
      const action =
        zoom.scale > 1.01
          ? "menu"
          : tapAction(settings.tapZones, x / v.width, y / v.height, rtl !== settings.invertTapZones);
      if (action === "menu") onMenu();
      else go(action);
    }, DOUBLE_TAP_MS);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const element = event.currentTarget as HTMLElement;
    if (typeof element.setPointerCapture === "function") element.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pointer, Pointer];
      gesture.current = {
        start: point,
        at: Date.now(),
        mode: "pinch",
        last: point,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
      setPinching(true);
      setDrag(0);
    } else {
      gesture.current = { start: point, at: Date.now(), mode: zoom.scale > 1.01 ? "pan" : "tap", last: point };
    }
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = { x: event.clientX, y: event.clientY };
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pointer, Pointer];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const s = sizes();
      const focus = { x: (a.x + b.x) / 2 - s.origin.left, y: (a.y + b.y) / 2 - s.origin.top };
      setZoom((z) => zoomAt(z, distance / (g.distance ?? distance), focus, s.content, s.viewport));
      g.distance = distance;
      return;
    }
    const dx = point.x - g.start.x;
    const dy = point.y - g.start.y;
    if (g.mode === "pan") {
      const s = sizes();
      setZoom((z) =>
        clampPan({ ...z, x: z.x + point.x - g.last.x, y: z.y + point.y - g.last.y }, s.content, s.viewport),
      );
    } else if (g.mode === "tap" && Math.abs(dx) > TAP_MOVE && Math.abs(dx) > Math.abs(dy)) {
      g.mode = "swipe";
    }
    if (g.mode === "swipe" && transition === "slide") setDrag(dx);
    g.last = point;
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (!g) return;
    if (g.mode === "pinch") {
      if (pointers.current.size === 0) {
        setPinching(false);
        gesture.current = undefined;
      }
      return;
    }
    gesture.current = undefined;
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    if (g.mode === "tap" && Math.hypot(dx, dy) < TAP_MOVE) {
      onTap({ x: event.clientX, y: event.clientY });
      return;
    }
    if (g.mode === "swipe") {
      const width = sizes().viewport.width;
      const velocity = Math.abs(dx) / Math.max(1, Date.now() - g.at);
      if (Math.abs(dx) > width * SWIPE_FRACTION || velocity > SWIPE_VELOCITY) {
        const forward = rtl ? dx > 0 : dx < 0;
        go(forward ? "next" : "prev");
      } else {
        setDrag(0);
      }
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    // Ctrl+wheel and trackpad pinch zoom into the cursor.
    event.preventDefault();
    const s = sizes();
    const focus = { x: event.clientX - s.origin.left, y: event.clientY - s.origin.top };
    setZoom((z) => zoomAt(z, Math.exp(-event.deltaY * 0.01), focus, s.content, s.viewport));
  };

  // The browser zooms the whole page on Ctrl+wheel unless the listener isn't passive.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const block = (event: globalThis.WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    element.addEventListener("wheel", block, { passive: false });
    return () => element.removeEventListener("wheel", block);
  }, []);

  const base = rtl ? 100 : -100;
  const target = sliding === "next" ? (rtl ? 200 : -200) : sliding === "prev" ? 0 : base;
  const zoomed = zoom.scale > 1.01;

  return (
    <div
      ref={viewport}
      className="absolute inset-0 overflow-hidden select-none"
      style={{ touchAction: zoomed || pinching ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      data-testid="paged-viewer"
    >
      <div
        className={cn("flex h-full w-full", rtl && "flex-row-reverse")}
        style={{
          transform: `translateX(calc(${target}% + ${sliding ? 0 : drag}px))`,
          transition: settling
            ? "none"
            : sliding
              ? `transform ${SLIDE_MS}ms ease-out`
              : drag === 0
                ? `transform ${SLIDE_MS / 2}ms ease-out`
                : "none",
        }}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || !sliding) return;
          const next = sliding === "next" ? index + 1 : index - 1;
          setSettling(true);
          setSliding(undefined);
          setDrag(0);
          onIndexChange(next);
        }}
      >
        {[index - 1, index, index + 1].map((slot) => (
          <div
            key={slot}
            aria-hidden={slot !== index}
            className={cn(
              "flex h-full w-full shrink-0 items-center justify-center",
              settings.fit === "width" && "block overflow-x-hidden overflow-y-auto",
              settings.fit === "height" && "overflow-x-auto overflow-y-hidden",
              settings.fit === "original" && "block overflow-auto",
              slot === index && transition === "fade" && "animate-in fade-in duration-200",
            )}
          >
            {slot < min || slot > max ? null : slot === min ? (
              renderStart()
            ) : slot === max ? (
              renderEnd()
            ) : (
              <div
                ref={slot === index ? content : undefined}
                className={cn(
                  "origin-center",
                  settings.fit === "screen" && "flex h-full w-full items-center justify-center",
                  settings.fit === "width" && "w-full",
                  settings.fit === "height" && "h-full",
                )}
                style={
                  slot === index
                    ? {
                        transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                        transition: pinching || gesture.current?.mode === "pan" ? "none" : "transform 180ms ease-out",
                      }
                    : undefined
                }
              >
                <PageImage
                  url={urls[slot] as string}
                  index={slot}
                  fit={settings.fit}
                  stretch={settings.stretch}
                  eager={Math.abs(slot - index) <= 1}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
