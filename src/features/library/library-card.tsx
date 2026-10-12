// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Cover } from "@/features/catalog/cover";
import { label, TYPE_LABELS } from "@/features/catalog/labels";
import type { LibraryEntry } from "@/features/catalog/library-index";
import { cn } from "@/lib/utils";
import type { LibraryView } from "./library-view";

type Shown = Pick<LibraryView, "unreadBadges" | "downloadBadges" | "continueButton">;

/** Unread and downloaded counts, in a corner of the cover. */
function Badges({ entry, view }: { entry: LibraryEntry; view: Shown }) {
  const unread = view.unreadBadges && entry.unread > 0;
  const downloaded = view.downloadBadges && entry.downloaded > 0;
  if (!unread && !downloaded) return null;
  return (
    <span className="absolute top-1.5 left-1.5 flex overflow-hidden rounded-md text-[11px] font-semibold shadow tabular-nums">
      {unread ? (
        <span className="bg-primary px-1.5 py-0.5 text-primary-foreground">
          {entry.unread}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
      {downloaded ? (
        <span className="bg-info px-1.5 py-0.5 text-white">
          {entry.downloaded}
          <span className="sr-only"> downloaded</span>
        </span>
      ) : null}
    </span>
  );
}

/** Opens the reader at the chapter to read next, without going through the work. */
function ContinueButton({ entry, className }: { entry: LibraryEntry; className?: string }) {
  if (!entry.continue_chapter_id) return null;
  return (
    <Link
      to="/read/$chapterId"
      params={{ chapterId: entry.continue_chapter_id }}
      aria-label={`${entry.started ? "Continue" : "Start"} ${entry.work.title}`}
      title={entry.started ? "Continue reading" : "Start reading"}
      className={cn(
        "flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Play className="size-4 fill-current" aria-hidden />
    </Link>
  );
}

const meta = (entry: LibraryEntry) =>
  [
    entry.work.year,
    label(TYPE_LABELS, entry.work.type),
    entry.chapters > 0 ? `${entry.chapters - entry.unread} / ${entry.chapters} read` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

/** A work in the grid: its cover, with the title over it (compact) or under it (comfortable). */
export function LibraryCard({ entry, view, compact }: { entry: LibraryEntry; view: Shown; compact: boolean }) {
  const { work } = entry;
  return (
    <div className="relative min-w-0">
      <Link
        to="/works/$workId"
        params={{ workId: work.id }}
        className="group flex min-w-0 flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative">
          <Cover url={work.cover_url} title={work.title} className="transition-transform group-hover:scale-[1.02]" />
          {compact ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pt-8 pb-2">
              <p
                className={cn(
                  "line-clamp-2 text-sm leading-snug font-medium text-white",
                  view.continueButton && entry.continue_chapter_id && "pr-9",
                )}
              >
                {work.title}
              </p>
            </div>
          ) : null}
          {work.attached_sources === 0 ? (
            <span className="absolute top-1.5 right-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow">
              No source yet
            </span>
          ) : null}
        </div>
        {compact ? null : (
          <div className="min-w-0 px-0.5">
            <p className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">{work.title}</p>
            <p className="truncate text-xs text-muted-foreground">{meta(entry)}</p>
          </div>
        )}
      </Link>
      {/* Laid over the cover, outside the work's link: one link can't hold another. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        <Badges entry={entry} view={view} />
        {view.continueButton ? (
          <ContinueButton entry={entry} className="pointer-events-auto absolute right-1.5 bottom-1.5" />
        ) : null}
      </div>
    </div>
  );
}

/** A work as a row: a small cover, the title and how far along, the counts and continue. */
export function LibraryRow({ entry, view }: { entry: LibraryEntry; view: Shown }) {
  const { work } = entry;
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <Link
        to="/works/$workId"
        params={{ workId: work.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Cover url={work.cover_url} title={work.title} className="w-10 shrink-0 rounded" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{work.title}</p>
          <p className="truncate text-xs text-muted-foreground">{meta(entry)}</p>
        </div>
      </Link>
      {view.unreadBadges && entry.unread > 0 ? (
        <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
          {entry.unread}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
      {view.downloadBadges && entry.downloaded > 0 ? (
        <span className="rounded-md bg-info px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
          {entry.downloaded}
          <span className="sr-only"> downloaded</span>
        </span>
      ) : null}
      {view.continueButton ? <ContinueButton entry={entry} /> : null}
    </div>
  );
}
