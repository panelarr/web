// SPDX-License-Identifier: GPL-3.0-or-later

import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageImage } from "./page-image";
import type { ReaderSettings } from "./settings";

/**
 * Pages side by side, scrolled sideways with native scrolling: left to right, or right to left
 * for manga. Each page fits the screen's height; only pages near the screen are rendered.
 */
export function HorizontalViewer({
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
  scroll?: { to: number | "forward" | "back"; id: number } | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const rtl = settings.direction === "rtl";
  const [height, setHeight] = useState(0);
  const sizes = useRef(new Map<number, { width: number; height: number }>());
  const count = urls.length + 2;

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setHeight(element.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count,
    horizontal: true,
    isRtl: rtl,
    getScrollElement: () => container.current,
    estimateSize: (i) => {
      if (i === 0 || i === count - 1) return 320;
      const size = sizes.current.get(i - 1);
      return (size ? (height * size.width) / size.height : (height || 700) * 0.7) + settings.pageGap;
    },
    overscan: Math.max(2, settings.preload),
  });

  const started = useRef(false);
  useEffect(() => {
    if (started.current || height === 0) return;
    started.current = true;
    if (startIndex > 0) virtualizer.scrollToIndex(startIndex + 1, { align: "start" });
  }, [height, startIndex, virtualizer]);

  const reported = useRef(-1);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = Math.abs(element.scrollLeft) + element.clientWidth / 2;
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
    else {
      const forward = scroll.to === "forward" ? 1 : -1;
      element.scrollBy({ left: forward * (rtl ? -1 : 1) * element.clientWidth * 0.8, behavior: "smooth" });
    }
  }, [scroll, virtualizer, rtl]);

  const items = virtualizer.getVirtualItems();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: taps are a touch shortcut; every action has a key (see the reader screen)
    // biome-ignore lint/a11y/useKeyWithClickEvents: the reader's keys are handled for the whole screen
    <div
      ref={container}
      dir={rtl ? "rtl" : "ltr"}
      tabIndex={-1}
      className="absolute inset-0 overflow-x-auto overflow-y-hidden overscroll-contain outline-none"
      data-testid="horizontal-viewer"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        if (settings.tapZones === "off" || (x > 1 / 3 && x < 2 / 3)) onMenu();
        else event.currentTarget.scrollBy({ left: (x < 1 / 3 ? -1 : 1) * rect.width * 0.8, behavior: "smooth" });
      }}
    >
      <div className="relative h-full" style={{ width: virtualizer.getTotalSize() }}>
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
            className="absolute top-0 h-full"
            style={{
              [rtl ? "right" : "left"]: 0,
              transform: `translateX(${rtl ? -item.start : item.start}px)`,
              paddingInlineEnd: item.index > 0 && item.index < count - 1 ? settings.pageGap : 0,
            }}
          >
            {item.index === 0 ? (
              <div className="flex h-full w-80 items-center justify-center">{renderStart()}</div>
            ) : item.index === count - 1 ? (
              <div className="flex h-full w-80 items-center justify-center">{renderEnd()}</div>
            ) : (
              <PageImage
                url={urls[item.index - 1] as string}
                index={item.index - 1}
                fit="height"
                stretch
                eager
                className="h-full w-auto"
                placeholderHeight="100%"
                placeholderWidth={`${Math.round((height || 700) * 0.7)}px`}
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
