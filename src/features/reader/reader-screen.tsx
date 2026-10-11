// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { useEvent } from "@/api/events-context";
import type { components } from "@/api/schema.gen";
import { serverUrl } from "@/lib/server-url";
import { cn } from "@/lib/utils";
import { ChapterEdge, PageNumber, ReaderOverlay } from "./chrome";
import { PagedViewer } from "./paged-viewer";
import { isContinuous, type Mode, type ReaderSettings } from "./settings";
import { ReaderSettingsSheet } from "./settings-sheet";
import { StripViewer } from "./strip-viewer";
import { useProgressSaver } from "./use-progress";
import { type SaveLevel, useReaderSettings } from "./use-reader-settings";

type ChapterPages = components["schemas"]["ChapterPages"];
type Work = components["schemas"]["Work"];

const BACKGROUNDS: Record<ReaderSettings["background"], string> = {
  theme: "bg-background",
  black: "bg-black",
  gray: "bg-neutral-700",
  white: "bg-white",
};

/** Modes still to come fall back to the closest one that works today. */
function playable(mode: Mode): Mode {
  if (mode === "double") return "single";
  if (mode === "horizontal") return "vertical";
  return mode;
}

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
  const queryClient = useQueryClient();
  const reader = useReaderSettings(data.work_id, data.variant.source_id, work?.type);
  const settings = { ...reader.settings, mode: playable(reader.settings.mode) };
  const continuous = isContinuous(settings.mode);
  const total = data.pages.length;
  const urls = useMemo(() => data.pages.map((p) => p.url), [data.pages]);

  const [index, setIndex] = useState(() => startPage(data, asked));
  const [overlay, setOverlay] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [level, setLevel] = useState<SaveLevel>("work");
  const [turn, setTurn] = useState<{ direction: "next" | "prev"; id: number }>();
  const [scroll, setScroll] = useState<{ to: number | "forward" | "back"; id: number }>();
  const save = useProgressSaver(data.chapter.id, total);

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

  // Load the pages ahead (and the one behind) so turning is instant.
  useEffect(() => {
    for (let i = Math.max(0, index - 1); i <= Math.min(total - 1, index + settings.preload); i++) {
      const image = new Image();
      image.decoding = "async";
      image.src = serverUrl(urls[i]) ?? "";
    }
  }, [index, settings.preload, total, urls]);

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
  const keys = useRef({ step, goToChapter, data, settings, continuous, sheet, overlay, total });
  keys.current = { step, goToChapter, data, settings, continuous, sheet, overlay, total };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current;
      if (k.sheet || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [role=dialog]")) return;
      const rtl = !k.continuous && k.settings.direction === "rtl";
      const map: Record<string, (() => void) | undefined> = {
        ArrowRight: k.continuous ? undefined : () => k.step(rtl ? "prev" : "next"),
        ArrowLeft: k.continuous ? undefined : () => k.step(rtl ? "next" : "prev"),
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
        Escape: () =>
          k.overlay ? setOverlay(false) : void navigate({ to: "/works/$workId", params: { workId: k.data.work_id } }),
      };
      const action = map[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const edge = (kind: "start" | "end") => () => (
    <ChapterEdge
      kind={kind}
      current={data.chapter}
      other={kind === "end" ? next : prev}
      workId={data.work_id}
      onGo={() => (kind === "end" ? goToChapter(data.next_chapter_id, 0) : goToChapter(data.prev_chapter_id, "last"))}
    />
  );

  return (
    <div
      className={cn("fixed inset-0 overflow-hidden text-foreground", BACKGROUNDS[settings.background])}
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
      {continuous ? (
        <StripViewer
          key={`${data.chapter.id}-${settings.mode}`}
          urls={urls}
          startIndex={index}
          onIndexChange={onIndexChange}
          settings={settings}
          onMenu={() => setOverlay((v) => !v)}
          renderStart={edge("start")}
          renderEnd={edge("end")}
          scroll={scroll}
        />
      ) : (
        <PagedViewer
          key={data.chapter.id}
          urls={urls}
          index={index}
          onIndexChange={onIndexChange}
          settings={settings}
          onMenu={() => setOverlay((v) => !v)}
          renderStart={edge("start")}
          renderEnd={edge("end")}
          turn={turn}
        />
      )}
      {settings.showPageNumber && !overlay ? <PageNumber index={index} total={total} /> : null}
      <ReaderOverlay
        visible={overlay}
        workId={data.work_id}
        workTitle={work?.title ?? ""}
        chapter={data.chapter}
        index={index}
        total={total}
        rtl={settings.direction === "rtl"}
        continuous={continuous}
        hasPrev={!!data.prev_chapter_id}
        hasNext={!!data.next_chapter_id}
        onPage={(page) => (continuous ? setScroll({ to: page, id: Date.now() }) : onIndexChange(page))}
        onPrevChapter={() => goToChapter(data.prev_chapter_id, "last")}
        onNextChapter={() => goToChapter(data.next_chapter_id, 0)}
        onSettings={() => setSheet(true)}
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
