// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { PageImage } from "./page-image";
import type { ReaderSettings } from "./settings";

type ChapterPages = components["schemas"]["ChapterPages"];
type Size = { width: number; height: number };

/** Bands between chapters, at the very top and at the very bottom. */
export type EdgeKind = "start" | "between" | "end";

type Item =
  | { key: string; kind: "page"; seg: number; page: number; ordinal: number }
  | { key: string; kind: EdgeKind; seg: number };

/** Pages fetched past the first one still loading: pages load in order, a few at a time. */
const AHEAD = 2;
/** Load the next chapter this many pages before the end. */
const NEXT_AT = 3;
const BAND = 112;

/** The query the reader route uses for a chapter's pages, so a chapter read on is cached. */
export const chapterPagesOptions = (chapterId: string) =>
  $api.queryOptions(
    "get",
    "/chapters/{chapter_id}/pages",
    { params: { path: { chapter_id: chapterId }, query: {} } },
    { staleTime: 5 * 60_000 },
  );

/**
 * A long strip: vertical (pages with gaps) or webtoon (no gaps), scrolled natively, so
 * scrolling, flinging and pinch-zoom feel like the platform's. Chapters follow one another:
 * nearing the end loads the next chapter below, scrolling up past the start loads the previous
 * one above, with a small band between them. Only pages near the screen are rendered, and pages
 * are fetched in reading order a few at a time, so the next page comes first even when the
 * source paces its requests.
 */
export function StripViewer({
  first,
  startIndex,
  onPosition,
  settings,
  onMenu,
  renderEdge,
  onPageSize,
  scroll,
}: {
  first: ChapterPages;
  startIndex: number;
  /** Where the reader is: a chapter and a page in it (-1 before its first, its length after its last). */
  onPosition: (chapterId: string, page: number) => void;
  settings: ReaderSettings;
  onMenu: () => void;
  /** A band: the start of the first chapter, between two, or the end of the last one. */
  renderEdge: (kind: EdgeKind, chapter: ChapterPages, next: ChapterPages | undefined) => ReactNode;
  onPageSize?: (chapterId: string, page: number, size: Size) => void;
  /** A scroll asked for from outside: a page of the current chapter, or a screen forward or back. */
  scroll?: { to: number | "forward" | "back"; id: number } | undefined;
}) {
  const queryClient = useQueryClient();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gap = settings.mode === "webtoon" ? 0 : settings.pageGap;
  const [segments, setSegments] = useState<ChapterPages[]>([first]);
  const sizes = useRef(new Map<string, Size>());
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const [position, setPosition] = useState({ seg: 0, page: Math.max(0, startIndex), ordinal: Math.max(0, startIndex) });

  const items = useMemo(() => {
    const list: Item[] = [{ key: "start", kind: "start", seg: 0 }];
    let ordinal = 0;
    segments.forEach((segment, seg) => {
      segment.pages.forEach((_, page) => {
        list.push({ key: `${segment.chapter.id}:${page}`, kind: "page", seg, page, ordinal: ordinal++ });
      });
      list.push(
        seg < segments.length - 1
          ? { key: `between:${segment.chapter.id}`, kind: "between", seg }
          : { key: "end", kind: "end", seg },
      );
    });
    return list;
  }, [segments]);

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
    count: items.length,
    getScrollElement: () => container.current,
    getItemKey: (i) => items[i]?.key ?? i,
    estimateSize: (i) => {
      const item = items[i];
      if (!item || item.kind !== "page") return BAND;
      const size = sizes.current.get(item.key);
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

  // Reading on: load the next chapter below, or the previous one above.
  const loading = useRef(false);
  const anchor = useRef<{ key: string; offset: number } | undefined>(undefined);
  const load = useCallback(
    async (direction: "next" | "prev") => {
      const edge = direction === "next" ? segments[segments.length - 1] : segments[0];
      const id = direction === "next" ? edge?.next_chapter_id : edge?.prev_chapter_id;
      if (!id || loading.current) return;
      loading.current = true;
      try {
        const chapter = await queryClient.fetchQuery(chapterPagesOptions(id));
        if (direction === "next") {
          setSegments((prev) => (prev.some((s) => s.chapter.id === id) ? prev : [...prev, chapter]));
        } else {
          // Keep what's on screen where it is while a chapter is added above it.
          // Anchored on a page: the band at the top moves up to the new first chapter.
          const element = container.current;
          const top = virtualizer
            .getVirtualItems()
            .find((v) => v.end > (element?.scrollTop ?? 0) && items[v.index]?.kind === "page");
          if (element && top) anchor.current = { key: String(top.key), offset: element.scrollTop - top.start };
          setSegments((prev) => (prev.some((s) => s.chapter.id === id) ? prev : [chapter, ...prev]));
        }
      } catch {
        // Not loaded (offline, gone): the band's button still offers the way on.
      } finally {
        loading.current = false;
      }
    },
    [segments, items, queryClient, virtualizer],
  );

  useLayoutEffect(() => {
    const element = container.current;
    const kept = anchor.current;
    if (!element || !kept) return;
    anchor.current = undefined;
    const index = items.findIndex((item) => item.key === kept.key);
    const measured = virtualizer.measurementsCache[index];
    if (measured) element.scrollTop = measured.start + kept.offset;
  }, [items, virtualizer]);

  // Report where the reader is, and read on near either end.
  const reported = useRef("");
  const scrolled = useRef(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      scrolled.current = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 4;
        const middle = element.scrollTop + element.clientHeight / 2;
        const virtual = atBottom
          ? virtualizer.getVirtualItems().at(-1)
          : virtualizer.getVirtualItems().find((v) => v.start <= middle && v.end > middle);
        const item = virtual ? items[virtual.index] : undefined;
        if (!item) return;
        const segment = segments[item.seg];
        if (!segment) return;
        const page = item.kind === "page" ? item.page : item.kind === "start" ? -1 : segment.pages.length;
        if (item.kind === "page") setPosition({ seg: item.seg, page: item.page, ordinal: item.ordinal });
        const at = `${segment.chapter.id}:${page}`;
        if (at !== reported.current) {
          reported.current = at;
          onPosition(segment.chapter.id, page);
        }
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [virtualizer, items, segments, onPosition]);

  // Near the end of the last chapter, the next one is loaded below; near the start of the first,
  // the one before it above (also right after opening there, when there's nothing to scroll).
  useEffect(() => {
    const segment = segments[position.seg];
    if (!segment) return;
    if (position.seg === segments.length - 1 && position.page >= segment.pages.length - NEXT_AT) void load("next");
    if (position.seg === 0 && position.page <= 1 && width > 0) void load("prev");
  }, [position, segments, width, load]);

  // A scroll asked for from outside, read against the latest strip.
  const latest = useRef({ items, segments, position });
  latest.current = { items, segments, position };
  useEffect(() => {
    const element = container.current;
    if (!scroll || !element) return;
    if (typeof scroll.to === "number") {
      const { items, segments, position } = latest.current;
      const chapter = segments[position.seg]?.chapter.id;
      const index = items.findIndex((item) => item.key === `${chapter}:${scroll.to}`);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
    } else {
      element.scrollBy({ top: (scroll.to === "forward" ? 1 : -1) * element.clientHeight * 0.8, behavior: "smooth" });
    }
  }, [scroll, virtualizer]);

  // Pages are fetched in reading order: those just behind, then up to AHEAD past the first one
  // ahead that hasn't loaded yet.
  const pageKeys = useMemo(() => items.filter((i) => i.kind === "page").map((i) => i.key), [items]);
  let frontier = position.ordinal;
  while (frontier < pageKeys.length && settled.has(pageKeys[frontier] as string)) frontier++;
  const mayLoad = (ordinal: number) => ordinal >= position.ordinal - 2 && ordinal <= frontier + AHEAD;

  const virtualItems = virtualizer.getVirtualItems();
  const shown =
    virtualItems.length > 0
      ? virtualItems
      : items.slice(0, 2).map((item, index) => ({ index, start: 0, key: item.key }));
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
        {shown.map((virtual) => {
          const item = items[virtual.index];
          if (!item) return null;
          const segment = segments[item.seg] as ChapterPages;
          return (
            <div
              key={virtual.key}
              data-index={virtual.index}
              ref={virtualItems.length > 0 ? virtualizer.measureElement : undefined}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtual.start}px)`,
                paddingBottom: item.kind === "page" ? gap : 0,
              }}
            >
              {item.kind === "page" ? (
                <PageImage
                  url={segment.pages[item.page]?.url as string}
                  index={item.page}
                  fit="width"
                  stretch
                  eager
                  hold={!mayLoad(item.ordinal)}
                  className="items-start"
                  placeholderHeight={`${Math.round((width || 360) * 1.45)}px`}
                  onSize={(size) => {
                    if (!sizes.current.has(item.key)) sizes.current.set(item.key, size);
                    onPageSize?.(segment.chapter.id, item.page, size);
                  }}
                  onSettled={() => setSettled((prev) => (prev.has(item.key) ? prev : new Set(prev).add(item.key)))}
                />
              ) : (
                renderEdge(item.kind, segment, segments[item.seg + 1])
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
