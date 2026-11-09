// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Columns3, File, GalleryVertical, Rows3 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { useEvent } from "@/api/events-context";
import type { components } from "@/api/schema.gen";
import { useBookmarks } from "@/features/works/use-bookmarks";
import { serverUrl } from "@/lib/server-url";
import { cn } from "@/lib/utils";
import { ChapterEdge, ChapterJumpSheet, PageNumber, ReaderOverlay } from "./chrome";
import { HorizontalViewer } from "./horizontal-viewer";
import { type ReaderState, readerState, useLeaveReader } from "./leave";
import { PagedViewer } from "./paged-viewer";
import { edgeColor, TapZonePreview, useFullscreen, useWakeLock } from "./screen-helpers";
import { isContinuous, type Mode, type ReaderSettings } from "./settings";
import { ReaderSettingsSheet } from "./settings-sheet";
import { isSpread, pairPages, viewOf } from "./spreads";
import { type EdgeKind, StripViewer } from "./strip-viewer";
import { useProgressSaver } from "./use-progress";
import { type SaveLevel, useReaderSettings } from "./use-reader-settings";

type ChapterPages = components["schemas"]["ChapterPages"];
type Work = components["schemas"]["Work"];

const BACKGROUNDS: Record<ReaderSettings["background"], string> = {
  theme: "bg-background",
  auto: "bg-background",
  black: "bg-black",
  gray: "bg-neutral-700",
  white: "bg-white",
};

type Size = { width: number; height: number };

/** The reading modes, as the layout button names and shows them, and the one it switches to. */
const LAYOUTS: Record<Mode, { label: string; icon: ReactNode }> = {
  single: { label: "Single page", icon: <File aria-hidden /> },
  double: { label: "Double page", icon: <BookOpen aria-hidden /> },
  vertical: { label: "Vertical scroll", icon: <Rows3 aria-hidden /> },
  webtoon: { label: "Webtoon", icon: <GalleryVertical aria-hidden /> },
  horizontal: { label: "Horizontal scroll", icon: <Columns3 aria-hidden /> },
};
const NEXT_MODE: Record<Mode, Mode> = {
  single: "double",
  double: "vertical",
  vertical: "webtoon",
  webtoon: "horizontal",
  horizontal: "single",
};

/** A page this much taller than wide is part of a long strip. */
const STRIP_RATIO = 2.5;

/** Where to open: the page asked for, else where the user left off (unless finished). */
export function startPage(data: ChapterPages, asked: number | "last" | undefined): number {
  const last = data.pages.length - 1;
  if (asked === "last") return Math.max(0, last);
  if (typeof asked === "number") return Math.min(Math.max(0, asked), Math.max(0, last));
  if (data.progress && !data.progress.completed) return Math.min(data.progress.page, Math.max(0, last));
  return 0;
}

/**
 * The full-screen reader for one chapter: pages from the server (the downloaded file or the
 * source, live), the mode and controls from the user's settings, and progress saved as they read.
 */
export function ReaderScreen({
  data,
  work,
  asked,
}: {
  data: ChapterPages;
  work: Work | undefined;
  asked: number | "last" | undefined;
}) {
  const navigate = useNavigate();
  const leave = useLeaveReader(data.work_id);
  // Where the reader was opened from, carried over as it replaces its entry chapter by chapter.
  const fromWork = useRouterState({ select: (state) => readerState(state.location.state).fromWork });
  const carried: ReaderState = fromWork ? { fromWork } : {};
  const carriedRef = useRef(carried);
  carriedRef.current = carried;
  const queryClient = useQueryClient();
  const reader = useReaderSettings(data.work_id, data.variant.source_id, work?.type);
  // Long strips found in a work without a chosen mode are read as a webtoon.
  const [stripFound, setStripFound] = useState(false);
  const settings: ReaderSettings = {
    ...reader.settings,
    mode: stripFound && reader.origin.mode === "default" ? ("webtoon" as Mode) : reader.settings.mode,
  };
  const continuous = isContinuous(settings.mode);
  const total = data.pages.length;
  const urls = useMemo(() => data.pages.map((p) => p.url), [data.pages]);

  // Page sizes, learnt as images load: for spreads and long strips.
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  const offerWebtoon = useRef(true);
  const recordSize = useCallback(
    (page: number, size: Size) => {
      setSizes((prev) => (prev[page] ? prev : { ...prev, [page]: size }));
      if (size.height > size.width * STRIP_RATIO && reader.origin.mode === "default" && offerWebtoon.current) {
        offerWebtoon.current = false;
        setStripFound(true);
        toast("Long strip found: reading as a webtoon.", {
          action: { label: "Keep for this series", onClick: () => reader.update({ mode: "webtoon" }, "work") },
        });
      }
    },
    [reader],
  );
  const views = useMemo(
    () =>
      settings.mode === "double" ? pairPages(total, (i) => isSpread(sizes[i]), settings.offsetSpreads) : undefined,
    [settings.mode, settings.offsetSpreads, total, sizes],
  );

  const [index, setIndex] = useState(() => startPage(data, asked));
  const [overlay, setOverlay] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [level, setLevel] = useState<SaveLevel>("work");
  const [turn, setTurn] = useState<{ direction: "next" | "prev"; id: number }>();
  const [scroll, setScroll] = useState<{ to: number | "forward" | "back"; id: number }>();
  const save = useProgressSaver(data.chapter.id, total);
  // The chapter's bookmark, shown at once and saved in the background.
  const bookmarks = useBookmarks(data.work_id);
  const [bookmarked, setBookmarked] = useState(data.chapter.bookmarked);
  useEffect(() => setBookmarked(data.chapter.bookmarked), [data.chapter.bookmarked]);
  useEvent("bookmarks.changed", (event) => {
    if (event.work_id !== data.work_id) return;
    void api
      .GET("/works/{work_id}/bookmarks", { params: { path: { work_id: data.work_id } } })
      .then(({ data: list }) => list && setBookmarked(list.chapter_ids.includes(data.chapter.id)));
  });
  const toggleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    bookmarks.set([data.chapter.id], next);
  };

  const chapters = $api.useQuery("get", "/works/{work_id}/chapters", {
    params: { path: { work_id: data.work_id }, query: { order: "asc" } },
  });
  const prev = chapters.data?.chapters.find((c) => c.id === data.prev_chapter_id);
  const next = chapters.data?.chapters.find((c) => c.id === data.next_chapter_id);

  const goToChapter = useCallback(
    (id: string | undefined, page: number | "last") => {
      if (!id) return;
      void navigate({
        to: "/read/$chapterId",
        params: { chapterId: id },
        search: page === 0 ? {} : { page },
        replace: true,
        state: { ...carriedRef.current } satisfies ReaderState,
      });
    },
    [navigate],
  );

  const onIndexChange = useCallback(
    (i: number) => {
      setIndex(i);
      if (i >= 0 && i < total) save(i);
      // Reaching the end marks the chapter read.
      if (i >= total) save(total - 1, true);
      setOverlay(false);
    },
    [save, total],
  );

  // In a long strip the reader can scroll into another chapter: it becomes the current one (the
  // URL and progress follow it), and the one left behind going forward is read.
  const arriving = useRef<number | undefined>(undefined);
  const onStripPosition = useCallback(
    (chapterId: string, page: number) => {
      if (chapterId === data.chapter.id) return onIndexChange(page);
      if (chapterId === data.next_chapter_id) save(total - 1, true);
      arriving.current = page;
      void navigate({
        to: "/read/$chapterId",
        params: { chapterId },
        search: {},
        replace: true,
        state: { ...carriedRef.current, continuing: true } satisfies ReaderState,
      });
    },
    [data.chapter.id, data.next_chapter_id, onIndexChange, save, total, navigate],
  );
  useEffect(() => {
    if (arriving.current === undefined || data.chapter.id === "") return;
    setIndex(arriving.current);
    arriving.current = undefined;
  }, [data.chapter.id]);

  // Another device read further: offer to catch up.
  useEvent("progress.synced", (event) => {
    if (event.chapter_id !== data.chapter.id || event.page === undefined || event.page <= index + 1) return;
    const page = event.page;
    toast(`You're on page ${page + 1} on another device.`, {
      action: {
        label: "Go there",
        onClick: () => (continuous ? setScroll({ to: page, id: Date.now() }) : setIndex(page)),
      },
    });
  });

  // Load the pages ahead (and the one behind) so turning is instant. A long strip loads its own,
  // in order; until the settings are known, it may be one.
  const settingsLoading = reader.loading;
  useEffect(() => {
    if (continuous || settingsLoading) return;
    for (let i = Math.max(0, index - 1); i <= Math.min(total - 1, index + settings.preload); i++) {
      const image = new Image();
      const page = i;
      image.decoding = "async";
      image.onload = () => recordSize(page, { width: image.naturalWidth, height: image.naturalHeight });
      image.src = serverUrl(urls[i]) ?? "";
    }
  }, [continuous, settingsLoading, index, settings.preload, total, urls, recordSize]);

  // Near the end, fetch the next chapter's page list so it opens at once.
  useEffect(() => {
    if (!data.next_chapter_id || index < total - 3) return;
    void queryClient.prefetchQuery(
      $api.queryOptions("get", "/chapters/{chapter_id}/pages", {
        params: { path: { chapter_id: data.next_chapter_id } },
      }),
    );
  }, [index, total, data.next_chapter_id, queryClient]);

  const step = useCallback(
    (direction: "next" | "prev") => {
      if (continuous) setScroll({ to: direction === "next" ? "forward" : "back", id: Date.now() });
      else setTurn({ direction, id: Date.now() });
    },
    [continuous],
  );

  // Keyboard: arrows follow the reading direction; Space and Page keys go forward and back.
  const keys = useRef({ step, goToChapter, data, settings, continuous, sheet, overlay, total, leave });
  keys.current = { step, goToChapter, data, settings, continuous, sheet, overlay, total, leave };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current;
      if (k.sheet || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [role=dialog]")) return;
      // Arrows sideways follow the direction wherever pages move sideways; long strips scroll natively.
      const strip = k.settings.mode === "vertical" || k.settings.mode === "webtoon";
      const rtl = !strip && k.settings.direction === "rtl";
      const map: Record<string, (() => void) | undefined> = {
        ArrowRight: strip ? undefined : () => k.step(rtl ? "prev" : "next"),
        ArrowLeft: strip ? undefined : () => k.step(rtl ? "next" : "prev"),
        ArrowDown: k.continuous ? undefined : () => k.step("next"),
        ArrowUp: k.continuous ? undefined : () => k.step("prev"),
        PageDown: () => k.step("next"),
        PageUp: () => k.step("prev"),
        " ": () => k.step(event.shiftKey ? "prev" : "next"),
        "]": () => k.goToChapter(k.data.next_chapter_id, 0),
        "[": () => k.goToChapter(k.data.prev_chapter_id, "last"),
        m: () => setOverlay((v) => !v),
        Enter: () => setOverlay((v) => !v),
        f: () =>
          void (document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen?.()),
        Home: () => (k.continuous ? setScroll({ to: 0, id: Date.now() }) : setIndex(0)),
        End: () => (k.continuous ? setScroll({ to: k.total - 1, id: Date.now() }) : setIndex(k.total - 1)),
        Escape: () => (k.overlay ? setOverlay(false) : k.leave()),
      };
      const action = map[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Match the page": the colour of the current page's edges.
  const [pageColor, setPageColor] = useState<string>();
  useEffect(() => {
    if (settings.background !== "auto" || index < 0 || index >= total) return;
    let cancelled = false;
    void edgeColor(serverUrl(urls[index]) ?? "").then((color) => {
      if (!cancelled && color) setPageColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.background, index, total, urls]);

  useWakeLock(settings.keepAwake);
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen();

  // Show where the tap zones are for a moment after they change.
  const [preview, setPreview] = useState(false);
  const zones = `${settings.tapZones}|${settings.invertTapZones}|${settings.direction}`;
  const firstZones = useRef(zones);
  useEffect(() => {
    if (zones === firstZones.current) return;
    firstZones.current = zones;
    setPreview(true);
    const timer = setTimeout(() => setPreview(false), 1600);
    return () => clearTimeout(timer);
  }, [zones]);

  const edge = (kind: "start" | "end") => () => (
    <ChapterEdge
      kind={kind}
      current={data.chapter}
      other={kind === "end" ? next : prev}
      workId={data.work_id}
      onGo={() => (kind === "end" ? goToChapter(data.next_chapter_id, 0) : goToChapter(data.prev_chapter_id, "last"))}
    />
  );

  // A band in a long strip: the start of the first chapter, between two, the end of the last.
  const chapterById = (id: string | undefined) => chapters.data?.chapters.find((c) => c.id === id);
  const stripEdge = (kind: EdgeKind, chapter: ChapterPages, following: ChapterPages | undefined) =>
    kind === "between" ? (
      <ChapterEdge compact kind="end" current={chapter.chapter} other={following?.chapter} workId={data.work_id} />
    ) : (
      <ChapterEdge
        compact
        kind={kind === "start" ? "start" : "end"}
        current={chapter.chapter}
        other={chapterById(kind === "start" ? chapter.prev_chapter_id : chapter.next_chapter_id)}
        workId={data.work_id}
        onGo={() =>
          kind === "start" ? goToChapter(chapter.prev_chapter_id, "last") : goToChapter(chapter.next_chapter_id, 0)
        }
      />
    );

  // Page by page in double mode turns a view (one or two pages) at a time.
  const viewIndex = views ? viewOf(views, index) : index;
  const onViewChange = (view: number) => {
    if (!views) return onIndexChange(view);
    const pages = views[view];
    onIndexChange(view < 0 ? -1 : view >= views.length || !pages ? total : (pages[pages.length - 1] as number));
  };
  // Right to left applies to everything that moves sideways.
  const sideways = settings.mode !== "vertical" && settings.mode !== "webtoon";
  const rtl = sideways && settings.direction === "rtl";

  return (
    <div
      className={cn("fixed inset-0 overflow-hidden text-foreground", BACKGROUNDS[settings.background])}
      style={settings.background === "auto" && pageColor ? { backgroundColor: pageColor } : undefined}
      role="application"
      aria-label={`Reader: ${work?.title ?? ""}`}
      aria-roledescription="reader"
    >
      <p className="sr-only" aria-live="polite">
        {index >= 0 && index < total
          ? `Page ${index + 1} of ${total}`
          : index >= total
            ? "End of the chapter"
            : "Start of the chapter"}
      </p>
      {/* Until the settings are known, no viewer: one for the wrong mode would load pages for nothing. */}
      {settingsLoading ? null : settings.mode === "horizontal" ? (
        <HorizontalViewer
          key={`${data.chapter.id}-${settings.mode}-${settings.direction}`}
          urls={urls}
          startIndex={index}
          onIndexChange={onIndexChange}
          settings={settings}
          onMenu={() => setOverlay((v) => !v)}
          renderStart={edge("start")}
          renderEnd={edge("end")}
          scroll={scroll}
        />
      ) : continuous ? (
        // One strip for the whole session: chapters follow one another in it.
        <StripViewer
          key={`strip-${settings.mode}`}
          first={data}
          startIndex={index}
          onPosition={onStripPosition}
          settings={settings}
          onMenu={() => setOverlay((v) => !v)}
          renderEdge={stripEdge}
          onPageSize={(chapterId, page, size) => {
            if (chapterId === data.chapter.id) recordSize(page, size);
          }}
          scroll={scroll}
        />
      ) : (
        <PagedViewer
          key={`${data.chapter.id}-${settings.mode}`}
          urls={urls}
          views={views}
          onPageSize={recordSize}
          index={viewIndex}
          onIndexChange={onViewChange}
          settings={settings}
          onMenu={() => setOverlay((v) => !v)}
          renderStart={edge("start")}
          renderEnd={edge("end")}
          turn={turn}
        />
      )}
      {preview && !continuous ? (
        <TapZonePreview layout={settings.tapZones} flip={rtl !== settings.invertTapZones} />
      ) : null}
      {settings.showPageNumber && !overlay ? <PageNumber index={index} total={total} /> : null}
      <ReaderOverlay
        visible={overlay}
        workId={data.work_id}
        workTitle={work?.title ?? ""}
        chapter={data.chapter}
        index={index}
        total={total}
        rtl={rtl}
        continuous={false}
        hasPrev={!!data.prev_chapter_id}
        hasNext={!!data.next_chapter_id}
        onPage={(page) => (continuous ? setScroll({ to: page, id: Date.now() }) : onIndexChange(page))}
        onPrevChapter={() => goToChapter(data.prev_chapter_id, "last")}
        onNextChapter={() => goToChapter(data.next_chapter_id, 0)}
        onSettings={() => setSheet(true)}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        bookmarked={bookmarked}
        onBookmark={toggleBookmark}
        onChapters={() => setJumping(true)}
        layout={LAYOUTS[settings.mode]}
        onLayout={() => {
          const next = NEXT_MODE[settings.mode];
          reader.update({ mode: next }, "work");
          toast(`${LAYOUTS[next].label}, for this series.`);
        }}
        keepAwake={settings.keepAwake}
        onKeepAwake={(keepAwake) => reader.update({ keepAwake }, level)}
      />
      <ChapterJumpSheet
        open={jumping}
        onOpenChange={setJumping}
        chapters={chapters.data?.chapters ?? []}
        currentId={data.chapter.id}
        onPick={(id) => {
          setJumping(false);
          if (id !== data.chapter.id) goToChapter(id, 0);
        }}
      />
      <ReaderSettingsSheet
        open={sheet}
        onOpenChange={setSheet}
        settings={reader.settings}
        origin={reader.origin}
        level={level}
        onLevelChange={setLevel}
        sourceName={data.variant.source_name}
        onChange={(change) => reader.update(change, level)}
        onReset={(l) => reader.reset(l)}
        onClear={(setting) => reader.clear(setting, level)}
      />
    </div>
  );
}

/** For the route: loads what the reader needs before showing it. */
export async function readerData(chapterId: string, variantId?: string) {
  const { data } = await api.GET("/chapters/{chapter_id}/pages", {
    params: { path: { chapter_id: chapterId }, query: variantId ? { variant_id: variantId } : {} },
  });
  return data as ChapterPages;
}
