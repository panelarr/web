// SPDX-License-Identifier: GPL-3.0-or-later

import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageImage } from "./page-image";
import type { ReaderSettings } from "./settings";

/**
 * A long strip: vertical (pages with gaps) or webtoon (no gaps), scrolled natively, so
 * scrolling, flinging and pinch-zoom feel like the platform's. Only pages near the screen are
 * rendered; their heights are measured as they load.
 */
export function StripViewer({
  urls,
  startIndex,
  onIndexChange,
  settings,
  onMenu,
  renderStart,
  renderEnd,
  scroll,
}: {
  urls: readonly string[];
  startIndex: number;
  onIndexChange: (index: number) => void;
  settings: ReaderSettings;
  onMenu: () => void;
  renderStart: () => ReactNode;
  renderEnd: () => ReactNode;
  /** A scroll asked for from outside: a page index, or a screen forward or back. */
  scroll?: { to: number | "forward" | "back"; id: number } | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gap = settings.mode === "webtoon" ? 0 : settings.pageGap;
  // Item 0 is the start of the chapter, then the pages, then its end.
  const count = urls.length + 2;
  const sizes = useRef(new Map<number, { width: number; height: number }>());

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setWidth(Math.min(element.clientWidth, settings.maxWidth || Number.POSITIVE_INFINITY));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [settings.maxWidth]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => container.current,
    estimateSize: (i) => {
      if (i === 0 || i === count - 1) return 320;
      const size = sizes.current.get(i - 1);
      return (size ? (width * size.height) / size.width : (width || 360) * 1.45) + gap;
    },
    overscan: Math.max(2, settings.preload),
  });

  // Open at the page asked for.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || width === 0) return;
    started.current = true;
    if (startIndex > 0) virtualizer.scrollToIndex(startIndex + 1, { align: "start" });
  }, [width, startIndex, virtualizer]);

  // Report the page in the middle of the screen.
  const reported = useRef(-1);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = element.scrollTop + element.clientHeight / 2;
        const item = virtualizer.getVirtualItems().find((v) => v.start <= middle && v.end > middle);
        if (!item) return;
        const page = Math.min(urls.length, Math.max(-1, item.index - 1));
        if (page !== reported.current) {
          reported.current = page;
          onIndexChange(page);
        }
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [virtualizer, urls.length, onIndexChange]);

  useEffect(() => {
    const element = container.current;
    if (!scroll || !element) return;
    if (typeof scroll.to === "number") virtualizer.scrollToIndex(scroll.to + 1, { align: "start" });
    else element.scrollBy({ top: (scroll.to === "forward" ? 1 : -1) * element.clientHeight * 0.8, behavior: "smooth" });
  }, [scroll, virtualizer]);

  const items = virtualizer.getVirtualItems();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: taps are a touch shortcut; every action has a key (see the reader screen)
    // biome-ignore lint/a11y/useKeyWithClickEvents: the reader's keys are handled for the whole screen
    <div
      ref={container}
      tabIndex={-1}
      className="absolute inset-0 overflow-y-auto overscroll-contain outline-none"
      data-testid="strip-viewer"
      onClick={(event) => {
        // Top third back a screen, bottom third forward, the middle the menu.
        const rect = event.currentTarget.getBoundingClientRect();
        const y = (event.clientY - rect.top) / rect.height;
        if (settings.tapZones === "off" || (y > 1 / 3 && y < 2 / 3)) onMenu();
        else event.currentTarget.scrollBy({ top: (y < 1 / 3 ? -1 : 1) * rect.height * 0.8, behavior: "smooth" });
      }}
    >
      <div className="relative mx-auto" style={{ height: virtualizer.getTotalSize(), width: width || "100%" }}>
        {(items.length > 0
          ? items
          : [
              { index: 0, start: 0, key: 0 },
              { index: 1, start: 0, key: 1 },
            ]
        ).map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={items.length > 0 ? virtualizer.measureElement : undefined}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${item.start}px)`,
              paddingBottom: item.index > 0 && item.index < count - 1 ? gap : 0,
            }}
          >
            {item.index === 0 ? (
              <div className="flex min-h-80 items-center justify-center">{renderStart()}</div>
            ) : item.index === count - 1 ? (
              <div className="flex min-h-80 items-center justify-center">{renderEnd()}</div>
            ) : (
              <PageImage
                url={urls[item.index - 1] as string}
                index={item.index - 1}
                fit="width"
                stretch
                eager
                className="items-start"
                placeholderHeight={`${Math.round((width || 360) * 1.45)}px`}
                onSize={(size) => {
                  if (!sizes.current.has(item.index - 1)) sizes.current.set(item.index - 1, size);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
