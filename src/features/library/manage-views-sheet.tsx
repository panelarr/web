// SPDX-License-Identifier: GPL-3.0-or-later

import { ArrowDown, ArrowUp, GripVertical, MoreVertical } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { SavedView } from "./library-view";
import { copyName, type LibraryViews, MAX_VIEW_NAME } from "./use-library-views";
import { DefaultMark } from "./view-switcher";

const failed = (what: string) => (error: unknown) => toast.error(`${what}: ${errorMessage(error)}`);

/**
 * Edit views…: rename in place, reorder (drag the handle, or the up and down buttons), make
 * one the default, duplicate and delete. The server keeps the rules (one default, never no
 * views); the buttons only say so up front.
 */
export function ManageViewsSheet({
  open,
  onOpenChange,
  views,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: LibraryViews;
}) {
  const desktop = useIsDesktop();
  const list = views.views ?? [];
  // While dragging: the order shown, saved when the handle is let go.
  const [preview, setPreview] = useState<string[]>();
  const [deleting, setDeleting] = useState<SavedView>();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const shown = preview ? preview.flatMap((id) => list.filter((v) => v.id === id)) : list;

  const order = (ids: string[]) => {
    if (ids.join() === list.map((v) => v.id).join()) return;
    views.reorder.mutate(ids, { onError: failed("Not reordered") });
  };
  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((v) => v.id);
    const [id] = ids.splice(index, 1);
    if (!id) return;
    ids.splice(index + by, 0, id);
    order(ids);
  };

  const drag = {
    start: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPreview(list.map((v) => v.id));
    },
    move: (event: PointerEvent<HTMLButtonElement>, id: string) => {
      if (!preview) return;
      // The row the pointer is over (by the middles of the others).
      const others = preview.filter((other) => other !== id);
      let index = others.length;
      for (const [i, other] of others.entries()) {
        const box = rows.current.get(other)?.getBoundingClientRect();
        if (box && event.clientY < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      const next = [...others.slice(0, index), id, ...others.slice(index)];
      if (next.join() !== preview.join()) setPreview(next);
    },
    end: () => {
      if (preview) order(preview);
      setPreview(undefined);
    },
  };

  const duplicate = (view: SavedView) =>
    views.create
      .mutateAsync({
        name: copyName(
          view.name,
          list.map((v) => v.name),
        ),
        definition: view.definition,
      })
      .then((copy) => toast.success(`Duplicated as “${copy.name}”.`))
      .catch(failed("Not duplicated"));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={desktop ? "right" : "bottom"}
          className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-md" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
          onEscapeKeyDown={(event) => {
            // A name being edited takes Escape first (it puts the name back); the next one closes.
            if (event.target instanceof HTMLElement && event.target.closest("[data-renaming]")) event.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit views</SheetTitle>
            <SheetDescription>Rename, reorder, and choose the view the library opens with.</SheetDescription>
          </SheetHeader>
          <ul aria-label="Your views" className="grid gap-1 overflow-y-auto px-2 pb-4">
            {shown.map((view, index) => (
              <li
                key={view.id}
                ref={(node) => {
                  if (node) rows.current.set(view.id, node);
                  else rows.current.delete(view.id);
                }}
                className={cn(
                  "flex items-center gap-1 rounded-md py-1 pr-1",
                  preview && "transition-transform",
                  preview && views.views?.[index]?.id !== view.id && "bg-accent",
                )}
              >
                <button
                  type="button"
                  aria-label={`Drag to move ${view.name}`}
                  title="Drag to move"
                  className="grid size-9 shrink-0 cursor-grab touch-none place-content-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing"
                  onPointerDown={drag.start}
                  onPointerMove={(e) => drag.move(e, view.id)}
                  onPointerUp={drag.end}
                  onPointerCancel={() => setPreview(undefined)}
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <NameField view={view} views={views} />
                {view.default ? <DefaultMark /> : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={`Move ${view.name} up`}
                  disabled={index === 0 || Boolean(preview)}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={`Move ${view.name} down`}
                  disabled={index === shown.length - 1 || Boolean(preview)}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={`More for ${view.name}`}
                    >
                      <MoreVertical aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={view.default}
                      onSelect={() => views.makeDefault.mutate(view.id, { onError: failed("Not made the default") })}
                    >
                      Make default
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void duplicate(view)}>Duplicate</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={list.length <= 1}
                      onSelect={() => setDeleting(view)}
                    >
                      Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
          {list.length === 1 ? (
            <p className="px-4 pb-4 text-xs text-muted-foreground">Your only view can't be deleted.</p>
          ) : null}
        </SheetContent>
      </Sheet>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(next) => !next && setDeleting(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its filters, sort and display are lost; the works stay in your library.
              {deleting?.default ? " Your first remaining view becomes the default." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) views.remove.mutate(deleting.id, { onError: failed("Not deleted") });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The view's name, renamed in place: saved on Enter or leaving the field. Escape puts it back
 * (the sheet then stays open: it closes on Escape only when no name is being edited).
 */
function NameField({ view, views }: { view: SavedView; views: LibraryViews }) {
  const [name, setName] = useState(view.name);
  const [error, setError] = useState<string>();
  useEffect(() => setName(view.name), [view.name]);
  const save = () => {
    const trimmed = name.trim();
    if (trimmed === view.name) return;
    if (!trimmed) {
      setName(view.name);
      return;
    }
    views.rename.mutate(
      { id: view.id, name: trimmed },
      {
        onError: (e) => {
          setName(view.name);
          setError(
            e instanceof ApiError && e.code === "name_taken" ? `You have a view named “${trimmed}”.` : errorMessage(e),
          );
        },
      },
    );
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setName(view.name);
      setError(undefined);
    }
  };
  return (
    <div className="min-w-0 flex-1">
      <Input
        aria-label={`Name of ${view.name}`}
        value={name}
        maxLength={MAX_VIEW_NAME}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        data-renaming={name !== view.name || error ? "" : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onBlur={save}
        onKeyDown={keys}
        className="h-9 truncate"
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
