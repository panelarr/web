// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Minimize, Settings2, SkipBack, SkipForward } from "lucide-react";
import type { components } from "@/api/schema.gen";
import { Button } from "@/components/ui/button";
import { chapterLabel } from "@/features/works/chapters";
import { cn } from "@/lib/utils";

type Chapter = components["schemas"]["UnifiedChapter"];

/** The panel at either end of a chapter: what you finished or are starting, and the way on. */
export function ChapterEdge({
  kind,
  current,
  other,
  workId,
  onGo,
}: {
  kind: "start" | "end";
  current: Chapter;
  other: Chapter | undefined;
  workId: string;
  onGo: () => void;
}) {
  const gap =
    other && current.number !== undefined && other.number !== undefined
      ? Math.abs(other.number - current.number) > 1.01 && Math.floor(Math.abs(other.number - current.number)) - 1
      : 0;
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center" data-reader-edge={kind}>
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {kind === "end" ? "Finished" : "Start of"}
        </p>
        <p className="mt-1 text-lg font-semibold [overflow-wrap:anywhere]">{chapterLabel(current)}</p>
      </div>
      {other ? (
        <div className="grid gap-3">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {kind === "end" ? "Next" : "Previous"}
            </p>
            <p className="mt-1 font-medium [overflow-wrap:anywhere]">{chapterLabel(other)}</p>
            {other.chosen ? (
              <p className="text-xs text-muted-foreground">
                {[other.chosen.source_name, other.chosen.scanlator].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          {gap ? (
            <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
              {gap === 1 ? "1 chapter seems to be missing" : `${gap} chapters seem to be missing`} between these.
            </p>
          ) : null}
          {current.chosen?.scanlator &&
          other.chosen?.scanlator &&
          current.chosen.scanlator !== other.chosen.scanlator ? (
            <p className="text-xs text-muted-foreground">Translated by {other.chosen.scanlator} from here.</p>
          ) : null}
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onGo();
            }}
          >
            {kind === "end" ? "Read the next chapter" : "Read the previous chapter"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {kind === "end" ? "That's the last chapter for now." : "This is the first chapter."}
        </p>
      )}
      <Button variant="ghost" size="sm" asChild onClick={(event) => event.stopPropagation()}>
        <Link to="/works/$workId" params={{ workId }}>
          Back to the chapters
        </Link>
      </Button>
    </div>
  );
}

/** The bars over the page: title, settings, page slider and chapter buttons. */
export function ReaderOverlay({
  visible,
  workId,
  workTitle,
  chapter,
  index,
  total,
  rtl,
  continuous,
  hasPrev,
  hasNext,
  onPage,
  onPrevChapter,
  onNextChapter,
  onSettings,
  fullscreen,
  onFullscreen,
}: {
  visible: boolean;
  workId: string;
  workTitle: string;
  chapter: Chapter;
  index: number;
  total: number;
  rtl: boolean;
  continuous: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPage: (index: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onSettings: () => void;
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const page = Math.min(total, Math.max(1, index + 1));
  const bar = "pointer-events-auto bg-background/90 backdrop-blur transition-transform duration-200 ease-out";
  const left =
    rtl && !continuous
      ? { label: "Next chapter", onClick: onNextChapter, enabled: hasNext }
      : { label: "Previous chapter", onClick: onPrevChapter, enabled: hasPrev };
  const right =
    rtl && !continuous
      ? { label: "Previous chapter", onClick: onPrevChapter, enabled: hasPrev }
      : { label: "Next chapter", onClick: onNextChapter, enabled: hasNext };
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between" aria-hidden={!visible}>
      <header className={cn(bar, "border-b pt-safe", !visible && "-translate-y-full")}>
        <div className="flex h-14 items-center gap-2 px-2 pl-safe pr-safe">
          <Button variant="ghost" size="icon" asChild tabIndex={visible ? 0 : -1}>
            <Link to="/works/$workId" params={{ workId }} aria-label="Close the reader">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{workTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {chapterLabel(chapter)}
              {chapter.chosen ? ` · ${chapter.chosen.source_name}` : ""}
            </p>
          </div>
          {onFullscreen && typeof document !== "undefined" && document.fullscreenEnabled ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={fullscreen ? "Leave fullscreen" : "Fullscreen"}
              tabIndex={visible ? 0 : -1}
              onClick={onFullscreen}
            >
              {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reader settings"
            tabIndex={visible ? 0 : -1}
            onClick={onSettings}
          >
            <Settings2 aria-hidden />
          </Button>
        </div>
      </header>
      <footer className={cn(bar, "border-t pb-safe", !visible && "translate-y-full")}>
        <div className="flex h-16 items-center gap-2 px-2 pl-safe pr-safe">
          <Button
            variant="ghost"
            size="icon"
            aria-label={left.label}
            disabled={!left.enabled}
            tabIndex={visible ? 0 : -1}
            onClick={left.onClick}
          >
            {rtl && !continuous ? <SkipForward className="-scale-x-100" aria-hidden /> : <SkipBack aria-hidden />}
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
              {rtl && !continuous ? total : page}
            </span>
            <input
              type="range"
              aria-label="Page"
              aria-valuetext={`Page ${page} of ${total}`}
              min={1}
              max={Math.max(1, total)}
              value={page}
              dir={rtl && !continuous ? "rtl" : "ltr"}
              tabIndex={visible ? 0 : -1}
              onChange={(event) => onPage(Number(event.target.value) - 1)}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-8 text-xs tabular-nums text-muted-foreground">{rtl && !continuous ? page : total}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={right.label}
            disabled={!right.enabled}
            tabIndex={visible ? 0 : -1}
            onClick={right.onClick}
          >
            {rtl && !continuous ? <SkipBack className="-scale-x-100" aria-hidden /> : <SkipForward aria-hidden />}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/** The page number in a corner while the bars are hidden. */
export function PageNumber({ index, total }: { index: number; total: number }) {
  if (index < 0 || index >= total) return null;
  return (
    <div className="pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-white tabular-nums">
      {index + 1} / {total}
    </div>
  );
}
