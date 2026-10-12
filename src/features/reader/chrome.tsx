// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  EllipsisVertical,
  List,
  Maximize,
  Minimize,
  Settings2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { ReactNode } from "react";
import type { components } from "@/api/schema.gen";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { chapterLabel } from "@/features/works/chapters";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type Chapter = components["schemas"]["UnifiedChapter"];

/** The panel at either end of a chapter: what you finished or are starting, and the way on. */
export function ChapterEdge({
  kind,
  current,
  other,
  workId,
  onGo,
  compact = false,
}: {
  kind: "start" | "end";
  current: Chapter;
  other: Chapter | undefined;
  workId: string;
  /** Opens the other chapter; without it (a band between chapters already shown) no button. */
  onGo?: () => void;
  /** A small band between pages (long strips), instead of a screen of its own. */
  compact?: boolean;
}) {
  const gap =
    other && current.number !== undefined && other.number !== undefined
      ? Math.abs(other.number - current.number) > 1.01 && Math.floor(Math.abs(other.number - current.number)) - 1
      : 0;
  if (compact) {
    const notes = [
      gap ? (gap === 1 ? "1 chapter seems to be missing." : `${gap} chapters seem to be missing.`) : "",
      current.chosen?.scanlator && other?.chosen?.scanlator && current.chosen.scanlator !== other.chosen.scanlator
        ? `Translated by ${other.chosen.scanlator} from here.`
        : "",
    ].filter(Boolean);
    return (
      <div className="mx-auto grid max-w-md gap-1 px-4 py-4 text-center text-sm" data-reader-edge={kind}>
        <p className="[overflow-wrap:anywhere]">
          <span className="text-muted-foreground">{kind === "end" ? "End of " : "Start of "}</span>
          <span className="font-medium">{chapterLabel(current)}</span>
        </p>
        {other ? (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {kind === "end" ? "Next: " : "Previous: "}
            {chapterLabel(other)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {kind === "end" ? "That's the last chapter for now." : "This is the first chapter."}
          </p>
        )}
        {notes.map((note) => (
          <p key={note} className="text-xs text-warning">
            {note}
          </p>
        ))}
        <div className="flex flex-wrap justify-center gap-1">
          {other && onGo ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onGo();
              }}
            >
              {kind === "end" ? "Next chapter" : "Previous chapter"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild onClick={(event) => event.stopPropagation()}>
            <Link to="/works/$workId" params={{ workId }}>
              Chapters
            </Link>
          </Button>
        </div>
      </div>
    );
  }
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
              onGo?.();
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

/**
 * The bars over the page, thin and out of the way: at the top the series and chapter, a
 * bookmark and a menu; at the bottom the page slider between the chapter buttons, and icons for
 * the chapters, the layout and the settings. They hide while reading and come back on a tap.
 */
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
  onChapters,
  layout,
  onLayout,
  fullscreen,
  onFullscreen,
  keepAwake,
  onKeepAwake,
  bookmarked = false,
  onBookmark,
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
  onChapters: () => void;
  /** The reading mode now, and switching to the next one. */
  layout: { label: string; icon: ReactNode };
  onLayout: () => void;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  keepAwake: boolean;
  onKeepAwake: (on: boolean) => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
}) {
  const page = Math.min(total, Math.max(1, index + 1));
  const bar = "pointer-events-auto bg-background/90 backdrop-blur transition-transform duration-200 ease-out";
  const tab = visible ? 0 : -1;
  const left =
    rtl && !continuous
      ? { label: "Next chapter", onClick: onNextChapter, enabled: hasNext }
      : { label: "Previous chapter", onClick: onPrevChapter, enabled: hasPrev };
  const right =
    rtl && !continuous
      ? { label: "Previous chapter", onClick: onPrevChapter, enabled: hasPrev }
      : { label: "Next chapter", onClick: onNextChapter, enabled: hasNext };
  const canFullscreen = onFullscreen && typeof document !== "undefined" && document.fullscreenEnabled;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between" aria-hidden={!visible}>
      <header className={cn(bar, "border-b pt-safe", !visible && "-translate-y-full")}>
        <div className="flex h-12 items-center gap-1 px-1 pl-safe pr-safe">
          <Button variant="ghost" size="icon" asChild tabIndex={tab}>
            <Link to="/works/$workId" params={{ workId }} aria-label="Close the reader">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{workTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {chapterLabel(chapter)}
              {chapter.chosen ? ` · ${chapter.chosen.source_name}` : ""}
            </p>
          </div>
          {onBookmark ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={bookmarked ? "Remove the bookmark" : "Bookmark this chapter"}
              aria-pressed={bookmarked}
              tabIndex={tab}
              onClick={onBookmark}
            >
              <Bookmark className={cn(bookmarked && "fill-current text-primary")} aria-hidden />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More" tabIndex={tab}>
                <EllipsisVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canFullscreen ? (
                <DropdownMenuItem onSelect={onFullscreen}>
                  {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
                  {fullscreen ? "Leave fullscreen" : "Fullscreen"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuCheckboxItem checked={keepAwake} onCheckedChange={(on) => onKeepAwake(on === true)}>
                Keep the screen on
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/works/$workId" params={{ workId }}>
                  The series page
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <footer className={cn(bar, "border-t pb-safe", !visible && "translate-y-full")}>
        <div className="flex h-11 items-center gap-1 px-1 pl-safe pr-safe">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={left.label}
            disabled={!left.enabled}
            tabIndex={tab}
            onClick={left.onClick}
          >
            {rtl && !continuous ? <SkipForward className="-scale-x-100" aria-hidden /> : <SkipBack aria-hidden />}
          </Button>
          <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
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
            tabIndex={tab}
            onChange={(event) => onPage(Number(event.target.value) - 1)}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-7 text-xs tabular-nums text-muted-foreground">{rtl && !continuous ? page : total}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={right.label}
            disabled={!right.enabled}
            tabIndex={tab}
            onClick={right.onClick}
          >
            {rtl && !continuous ? <SkipBack className="-scale-x-100" aria-hidden /> : <SkipForward aria-hidden />}
          </Button>
        </div>
        <div className="flex h-12 items-center justify-around border-t pl-safe pr-safe">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Chapters"
            title="Chapters"
            tabIndex={tab}
            onClick={onChapters}
          >
            <List aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Layout: ${layout.label} (switch)`}
            title={`Layout: ${layout.label}`}
            tabIndex={tab}
            onClick={onLayout}
          >
            {layout.icon}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reader settings"
            title="Settings"
            tabIndex={tab}
            onClick={onSettings}
          >
            <Settings2 aria-hidden />
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

/** The work's chapters, to jump to one: the current one marked and scrolled to. */
export function ChapterJumpSheet({
  open,
  onOpenChange,
  chapters,
  currentId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: readonly Chapter[];
  currentId: string;
  onPick: (id: string) => void;
}) {
  const desktop = useIsDesktop();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-sm" : "max-h-[75dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader>
          <SheetTitle>Chapters</SheetTitle>
          <SheetDescription className="sr-only">Jump to another chapter.</SheetDescription>
        </SheetHeader>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Chapters">
          {chapters.map((chapter) => {
            const current = chapter.id === currentId;
            return (
              <li key={chapter.id}>
                <button
                  type="button"
                  ref={current ? (element) => element?.scrollIntoView?.({ block: "center" }) : undefined}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm [overflow-wrap:anywhere] hover:bg-accent",
                    current && "bg-primary/10 font-medium text-primary",
                  )}
                  onClick={() => onPick(chapter.id)}
                >
                  {chapterLabel(chapter)}
                  {chapter.bookmarked ? (
                    <Bookmark className="ml-1.5 inline size-3 fill-current text-primary" aria-label="Bookmarked" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
