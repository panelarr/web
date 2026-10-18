// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { $api } from "@/api/client";
import { MANUAL } from "@/api/events";
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
/** Load the previous chapter this many pages after the first one's start: flings up cover pages fast. */
const PREV_AT = 5;
const BAND = 112;
/** How long the strip must be still before a deferred correction becomes a scroll position. */
const SETTLE_MS = 150;

/** The query the reader route uses for a chapter's pages, so a chapter read on is cached. */
export const chapterPagesOptions = (chapterId: string) =>
  $api.queryOptions(
    "get",
    "/chapters/{chapter_id}/pages",
    { params: { path: { chapter_id: chapterId }, query: {} } },
    { staleTime: 5 * 60_000, meta: MANUAL },
  );

/**
 * A long strip: vertical (pages with gaps) or webtoon (no gaps), scrolled natively, so
 * scrolling, flinging and pinch-zoom feel like the platform's. Chapters follow one another:
 * nearing the end loads the next chapter below, nearing the start loads the previous one above
 * (added while the strip is still, so it's there before the reader scrolls up to it), with a
 * small band between them. Only pages near the screen are rendered, and pages
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
  // Where the reader is, as the key of the page in the middle of the screen: keys don't move when
  // a chapter is added above (positions in the list would).
  const [current, setCurrent] = useState(() => `${first.chapter.id}:${Math.max(0, startIndex)}`);

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
  const pageKeys = useMemo(() => items.filter((i) => i.kind === "page").map((i) => i.key), [items]);
  const here = items.find((item) => item.key === current);
  const position =
    here?.kind === "page"
      ? { seg: here.seg, page: here.page, ordinal: here.ordinal }
      : { seg: 0, page: 0, ordinal: Math.max(0, pageKeys.indexOf(current)) };

  // Space kept for pages not loaded yet: the shape of this chapter's pages seen so far (or the
  // last page seen anywhere), decided once per page so that only a page arriving changes the
  // layout, and the strip keeps what's on screen in place when that happens above it.
  const ratios = useRef(new Map<string, number>());
  const lastRatio = useRef(1.45);
  const guesses = useRef(new Map<string, number>());
  const ratioOf = (key: string, chapterId: string) => {
    const size = sizes.current.get(key);
    if (size) return size.height / size.width;
    let guess = guesses.current.get(key);
    if (guess === undefined) {
      guess = ratios.current.get(chapterId) ?? lastRatio.current;
      guesses.current.set(key, guess);
    }
    return guess;
  };

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
      if (item?.kind !== "page") return BAND;
      const chapterId = segments[item.seg]?.chapter.id ?? "";
      // Whole pixels, as each page is sized (see PageImage), so estimates and measures agree.
      return Math.round((width || 360) * ratioOf(item.key, chapterId)) + gap;
    },
    overscan: Math.max(2, settings.preload),
  });
  // The strip keeps the page being read in place itself (below), not the virtualizer.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  // Open at the page asked for (by its key: the previous chapter may be above it already).
  const started = useRef(false);
  useEffect(() => {
    if (started.current || width === 0) return;
    started.current = true;
    const index = items.findIndex((item) => item.key === `${first.chapter.id}:${startIndex}`);
    if (startIndex > 0 && index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
  }, [width, startIndex, virtualizer, items, first.chapter.id]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  // The page being read stays put. Whenever pages around it change size (they load, or a
  // chapter is added above), the strip scrolls by exactly as much as that page moved, before the
  // browser paints. This works the same in every browser (iOS Safari has no scroll anchoring).
  const anchor = useRef<{ key: string; top: number } | undefined>(undefined);
  /** The scroll position the anchor has taken into account. */
  const seen = useRef(0);
  // The reader's own scrolling moves the page being read with it. Browsers fire "scroll" a frame
  // after the position changed, so this is also checked before every correction: anything that
  // re-renders in between must not pull the page back.
  const account = useCallback(() => {
    const element = container.current;
    if (!element) return;
    const top = element.scrollTop;
    if (top !== seen.current && anchor.current) {
      anchor.current = { ...anchor.current, top: anchor.current.top - (top - seen.current) };
    }
    seen.current = top;
  }, []);
  /** Takes the page in the middle of the screen, where it is now, as the one to keep in place. */
  const pickAnchor = useCallback(() => {
    const element = container.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const page = document
      .elementFromPoint?.(box.left + element.clientWidth / 2, box.top + element.clientHeight / 2)
      ?.closest<HTMLElement>("[data-key]");
    if (!page?.dataset.key) return;
    anchor.current = { key: page.dataset.key, top: page.getBoundingClientRect().top - box.top };
    seen.current = element.scrollTop;
  }, []);
  // While the reader touches the strip or it still moves on its own (a fling), setting the
  // scroll position from script stops the fling on iOS. Corrections are made with a transform
  // of the content meanwhile, and folded into the scroll position once the strip has settled,
  // in one step that moves nothing on screen.
  const deferred = useRef({ shift: 0, touching: false, last: 0, timer: undefined as number | undefined });
  const busy = useCallback(() => {
    const d = deferred.current;
    return d.touching || performance.now() - d.last < SETTLE_MS;
  }, []);
  const settleLater = useCallback(() => {
    const d = deferred.current;
    window.clearTimeout(d.timer);
    const check = () => {
      const element = container.current;
      const content = element?.firstElementChild as HTMLElement | null | undefined;
      if (!element || !content || d.shift === 0) return;
      if (busy()) {
        d.timer = window.setTimeout(check, SETTLE_MS);
        return;
      }
      content.style.transform = "";
      element.scrollTop += d.shift;
      d.shift = 0;
      seen.current = element.scrollTop;
    };
    d.timer = window.setTimeout(check, SETTLE_MS);
  }, [busy]);
  const holdAnchor = useCallback(() => {
    const element = container.current;
    account();
    // Nothing read yet (just opened, not scrolled): what's in the middle now is the page to keep.
    if (!anchor.current) return pickAnchor();
    const kept = anchor.current;
    if (!element || !kept) return;
    const page = [...element.querySelectorAll<HTMLElement>("[data-key]")].find((e) => e.dataset.key === kept.key);
    if (!page) {
      // Not rendered (a chapter was just added above, and the strip renders around where it was
      // scrolled): place it from the layout, then the next pass places it exactly.
      const index = itemsRef.current.findIndex((item) => item.key === kept.key);
      const start = index >= 0 ? virtualizerRef.current.getOffsetForIndex(index, "start")?.[0] : undefined;
      if (start === undefined) return;
      // Placed from the layout: a pending transform no longer applies.
      const d = deferred.current;
      if (d.shift !== 0) {
        (element.firstElementChild as HTMLElement | null)?.style.removeProperty("transform");
        d.shift = 0;
      }
      element.scrollTop = start + kept.top * -1;
      seen.current = element.scrollTop;
      return;
    }
    const moved = page.getBoundingClientRect().top - element.getBoundingClientRect().top - kept.top;
    if (Math.abs(moved) < 0.5) return;
    // Near either end the browser clamps the scroll position itself when the content's height
    // changes, which a transform would then compensate a second time: correct directly there.
    const room = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nearEnd = element.scrollTop < element.clientHeight || room < element.clientHeight + Math.abs(moved);
    if (busy() && !nearEnd) {
      const d = deferred.current;
      d.shift += moved;
      (element.firstElementChild as HTMLElement | null)?.style.setProperty("transform", `translateY(${-d.shift}px)`);
      settleLater();
      return;
    }
    element.scrollTop += moved;
    // The strip's own correction: what's on screen didn't move.
    seen.current = element.scrollTop;
  }, [account, pickAnchor, busy, settleLater]);
  useLayoutEffect(holdAnchor);
  useEffect(() => {
    const element = container.current;
    const content = element?.firstElementChild;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(holdAnchor);
    observer.observe(content);
    return () => observer.disconnect();
  }, [holdAnchor]);

  /** Resolves once the reader isn't touching the strip, it doesn't move and no correction is pending. */
  const still = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const check = () => (busy() || deferred.current.shift !== 0 ? window.setTimeout(check, SETTLE_MS) : resolve());
        check();
      }),
    [busy],
  );

  // Reading on: load the next chapter below, or the previous one above.
  const loading = useRef({ next: false, prev: false });
  const load = useCallback(
    async (direction: "next" | "prev") => {
      const edge = direction === "next" ? segments[segments.length - 1] : segments[0];
      const id = direction === "next" ? edge?.next_chapter_id : edge?.prev_chapter_id;
      if (!id || loading.current[direction]) return;
      loading.current[direction] = true;
      try {
        const chapter = await queryClient.fetchQuery(chapterPagesOptions(id));
        if (direction === "next") {
          setSegments((prev) => (prev.some((s) => s.chapter.id === id) ? prev : [...prev, chapter]));
        } else {
          // Added above, everything moves down by the chapter's height and the strip scrolls by as
          // much: done mid-fling, that would stop the fling on iOS (or show the chapter late, as a
          // transform), so it waits for the strip to be still, which it is between flings.
          await still();
          // What's on screen stays where it is (see the anchor below).
          pickAnchor();
          setSegments((prev) => (prev.some((s) => s.chapter.id === id) ? prev : [chapter, ...prev]));
        }
      } catch {
        // Not loaded (offline, gone): the band's button still offers the way on.
      } finally {
        loading.current[direction] = false;
      }
    },
    [segments, queryClient, pickAnchor, still],
  );

  // Report where the reader is, and read on near either end.
  const reported = useRef("");
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    let lastTop = element.scrollTop;
    const onScroll = () => {
      deferred.current.last = performance.now();
      if (deferred.current.shift !== 0) settleLater();
      // The reader's scrolling, not the strip's own corrections (already taken into account).
      const byReader = element.scrollTop !== seen.current;
      account();
      const top = element.scrollTop;
      // Scrolling up into the first chapter's start: the one before it is wanted.
      if (byReader && top < lastTop && top < element.clientHeight / 2) void loadRef.current("prev");
      lastTop = top;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // What's on screen, in the layout's terms: a deferred correction (a transform) shows the
        // content that much further along.
        const visibleTop = element.scrollTop + deferred.current.shift;
        const atBottom = visibleTop + element.clientHeight >= element.scrollHeight - 4;
        const middle = visibleTop + element.clientHeight / 2;
        // The new anchor: the page in the middle of the screen, where it now is.
        pickAnchor();
        const virtual = atBottom
          ? virtualizer.getVirtualItems().at(-1)
          : virtualizer.getVirtualItems().find((v) => v.start <= middle && v.end > middle);
        const item = virtual ? items[virtual.index] : undefined;
        if (!item) return;
        const segment = segments[item.seg];
        if (!segment) return;
        const page = item.kind === "page" ? item.page : item.kind === "start" ? -1 : segment.pages.length;
        if (item.kind === "page") setCurrent(item.key);
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
  }, [virtualizer, items, segments, onPosition, account, pickAnchor, settleLater]);

  // At the very top there's nothing to scroll: a wheel or a pull down asks for the chapter before.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let startY: number | undefined;
    // At the start: the first chapter's band at, or just above, the top of the screen.
    const atTop = () => element.scrollTop <= BAND + 8;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && atTop()) void loadRef.current("prev");
    };
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY;
      deferred.current.touching = true;
    };
    const onTouchEnd = () => {
      deferred.current.touching = false;
      deferred.current.last = performance.now();
      settleLater();
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (startY !== undefined && y !== undefined && y - startY > 24 && atTop()) void loadRef.current("prev");
    };
    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [settleLater]);

  // Near the end of the last chapter, the next one is loaded below (nothing on screen moves); near
  // the start of the first, the previous one above, before the reader gets there.
  const { seg: currentSeg, page: currentPage } = position;
  useEffect(() => {
    const segment = segments[currentSeg];
    if (segment && currentSeg === segments.length - 1 && currentPage >= segment.pages.length - NEXT_AT) {
      void load("next");
    }
    if (currentSeg === 0 && currentPage < PREV_AT) void load("prev");
  }, [currentSeg, currentPage, segments, load]);

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
      // The strip keeps the page on screen in place itself (iOS Safari has no scroll anchoring),
      // so the browser's own anchoring is off rather than adding a second correction.
      className="absolute inset-0 overflow-y-auto overscroll-contain outline-none [overflow-anchor:none]"
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
              data-key={virtual.key}
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
                  known={sizes.current.has(item.key)}
                  exactWidth={width || undefined}
                  size={sizes.current.get(item.key)}
                  className="items-start"
                  placeholderHeight={`${Math.round((width || 360) * ratioOf(item.key, segment.chapter.id))}px`}
                  onSize={(size) => {
                    if (!sizes.current.has(item.key)) sizes.current.set(item.key, size);
                    const ratio = size.height / size.width;
                    if (!ratios.current.has(segment.chapter.id)) ratios.current.set(segment.chapter.id, ratio);
                    lastRatio.current = ratio;
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
