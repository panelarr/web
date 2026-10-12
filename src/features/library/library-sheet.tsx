// SPDX-License-Identifier: GPL-3.0-or-later

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { FILTERS, type Filter, type Layout, type LibraryView, SORTS, type Sort } from "./library-view";

/** One sheet for the library: what to show, in what order, and how. */
export function LibrarySheet({
  open,
  onOpenChange,
  view,
  counts,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: LibraryView;
  counts: Record<Filter, number>;
  onChange: (change: Partial<LibraryView>) => void;
}) {
  const desktop = useIsDesktop();
  const toggle = (filter: Filter, on: boolean) =>
    onChange({ filters: on ? [...view.filters, filter] : view.filters.filter((f) => f !== filter) });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-sm" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Library</SheetTitle>
          <SheetDescription>Filter, sort and show your library.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="filter" className="flex min-h-0 flex-1 flex-col gap-0 pt-2">
          <TabsList className="mx-4 grid w-auto grid-cols-3">
            <TabsTrigger value="filter">Filter</TabsTrigger>
            <TabsTrigger value="sort">Sort</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
          </TabsList>
          <div className="overflow-y-auto px-4 py-4">
            <TabsContent value="filter" className="grid gap-3">
              {(Object.keys(FILTERS) as Filter[]).map((filter) => (
                <Check
                  key={filter}
                  label={`${FILTERS[filter]} (${counts[filter]})`}
                  checked={view.filters.includes(filter)}
                  onChange={(on) => toggle(filter, on)}
                />
              ))}
            </TabsContent>
            <TabsContent value="sort">
              <fieldset className="grid gap-1">
                <legend className="mb-2 text-sm font-medium">Sort by</legend>
                {(Object.keys(SORTS) as Sort[]).map((sort) => {
                  const chosen = view.sort === sort;
                  return (
                    <button
                      key={sort}
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => onChange(chosen ? { reverse: !view.reverse } : { sort, reverse: false })}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                        chosen && "bg-primary/10 font-medium text-primary",
                      )}
                    >
                      {SORTS[sort]}
                      {chosen ? (
                        view.reverse ? (
                          <ArrowUpNarrowWide className="size-4" aria-label="reversed" />
                        ) : (
                          <ArrowDownWideNarrow className="size-4" aria-hidden />
                        )
                      ) : null}
                    </button>
                  );
                })}
              </fieldset>
              <p className="mt-2 text-xs text-muted-foreground">Tap the chosen one again to reverse it.</p>
            </TabsContent>
            <TabsContent value="display" className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Show as</legend>
                {(
                  [
                    ["compact", "Compact grid"],
                    ["comfortable", "Comfortable grid"],
                    ["list", "List"],
                  ] as const
                ).map(([layout, text]) => (
                  <Radio
                    key={layout}
                    name="library-layout"
                    label={text}
                    checked={view.layout === layout}
                    onChange={() => onChange({ layout: layout as Layout })}
                  />
                ))}
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">On each work</legend>
                <Check
                  label="Unread chapters"
                  checked={view.unreadBadges}
                  onChange={(unreadBadges) => onChange({ unreadBadges })}
                />
                <Check
                  label="Downloaded chapters"
                  checked={view.downloadBadges}
                  onChange={(downloadBadges) => onChange({ downloadBadges })}
                />
                <Check
                  label="A continue reading button"
                  checked={view.continueButton}
                  onChange={(continueButton) => onChange({ continueButton })}
                />
              </fieldset>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function Radio({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <input type="radio" id={id} name={name} checked={checked} onChange={onChange} className="size-4 accent-primary" />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
