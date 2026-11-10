// SPDX-License-Identifier: GPL-3.0-or-later

import { Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { SavedView } from "./library-view";

/**
 * The library's heading: the active view's name, which opens the list of views (a menu on
 * desktops, a sheet from the bottom on phones, within a thumb's reach) with New view… and
 * Edit views….
 */
export function ViewSwitcher({
  name,
  views,
  activeId,
  onSelect,
  onNew,
  onManage,
}: {
  name: string;
  views: readonly SavedView[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onManage: () => void;
}) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const trigger = (
    <button
      type="button"
      aria-haspopup={desktop ? "menu" : "dialog"}
      aria-expanded={open}
      className="-mx-1.5 flex min-w-0 items-center gap-1 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={desktop ? undefined : () => setOpen(true)}
    >
      <span className="truncate">{name}</span>
      <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
  if (!desktop) {
    const heading = <h1 className="flex min-w-0 text-2xl font-semibold tracking-tight">{trigger}</h1>;
    const pick = (action: () => void) => () => {
      setOpen(false);
      action();
    };
    return (
      <>
        {heading}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl pb-safe">
            <SheetHeader>
              <SheetTitle>Library views</SheetTitle>
              <SheetDescription className="sr-only">Choose which view of your library to show.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Library views" className="overflow-y-auto px-2">
              <ul className="grid">
                {views.map((view) => (
                  <li key={view.id}>
                    <button
                      type="button"
                      aria-current={view.id === activeId ? "true" : undefined}
                      onClick={pick(() => onSelect(view.id))}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-accent",
                        view.id === activeId && "font-medium text-primary",
                      )}
                    >
                      <Check className={cn("size-4 shrink-0", view.id !== activeId && "invisible")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{view.name}</span>
                      {view.default ? <DefaultMark /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-2 grid border-t px-2 pt-2 pb-2">
              <button
                type="button"
                onClick={pick(onNew)}
                className="flex min-h-12 items-center gap-3 rounded-md px-3 hover:bg-accent"
              >
                <Plus className="size-4" aria-hidden />
                New view…
              </button>
              <button
                type="button"
                onClick={pick(onManage)}
                className="flex min-h-12 items-center gap-3 rounded-md px-3 hover:bg-accent"
              >
                <Settings2 className="size-4" aria-hidden />
                Edit views…
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <h1 className="flex min-w-0 text-2xl font-semibold tracking-tight">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          {views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              aria-current={view.id === activeId ? "true" : undefined}
              onSelect={() => onSelect(view.id)}
              className={cn(view.id === activeId && "font-medium text-primary")}
            >
              <Check className={cn("text-current", view.id !== activeId && "invisible")} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {view.default ? <DefaultMark /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onNew}>
            <Plus aria-hidden />
            New view…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onManage}>
            <Settings2 aria-hidden />
            Edit views…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </h1>
  );
}

export function DefaultMark() {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
      Default
    </span>
  );
}
