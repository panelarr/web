// SPDX-License-Identifier: GPL-3.0-or-later

import { useId } from "react";
import { NativeSelect } from "@/components/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { ChapterView } from "./chapter-view";

/** One sheet for the chapter list: what to show, in what order, and how. */
export function ChapterViewSheet({
  open,
  onOpenChange,
  view,
  onChange,
  scanlators,
  bookmarks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ChapterView;
  onChange: (change: Partial<ChapterView>) => void;
  scanlators: readonly string[];
  /** Offer the bookmarked filter. */
  bookmarks: boolean;
}) {
  const desktop = useIsDesktop();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-sm" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Chapters</SheetTitle>
          <SheetDescription>Filter, sort and show the chapters.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="filter" className="flex min-h-0 flex-1 flex-col gap-0 pt-2">
          <TabsList className="mx-4 grid grid-cols-3">
            <TabsTrigger value="filter">Filter</TabsTrigger>
            <TabsTrigger value="sort">Sort</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
          </TabsList>
          <div className="overflow-y-auto px-4 py-4">
            <TabsContent value="filter" className="grid gap-3">
              <Check label="Unread" checked={view.unread} onChange={(unread) => onChange({ unread })} />
              <Check label="Downloaded" checked={view.downloaded} onChange={(downloaded) => onChange({ downloaded })} />
              {bookmarks ? (
                <Check
                  label="Bookmarked"
                  checked={view.bookmarked}
                  onChange={(bookmarked) => onChange({ bookmarked })}
                />
              ) : null}
              {scanlators.length > 1 ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="chapter-scanlator">Scanlator</Label>
                  <NativeSelect
                    id="chapter-scanlator"
                    value={view.scanlator ?? ""}
                    onChange={(e) => onChange({ scanlator: e.target.value || undefined })}
                  >
                    <option value="">Any</option>
                    {scanlators.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="sort" className="grid gap-4">
              <Choice
                legend="Sort by"
                value={view.sort}
                options={[
                  ["number", "Chapter number"],
                  ["date", "Upload date"],
                ]}
                onChange={(sort) => onChange({ sort })}
              />
              <Choice
                legend="Order"
                value={view.order}
                options={[
                  ["desc", "Newest first"],
                  ["asc", "Oldest first"],
                ]}
                onChange={(order) => onChange({ order })}
              />
            </TabsContent>
            <TabsContent value="display" className="grid gap-4">
              <Choice
                legend="Show"
                value={view.display}
                options={[
                  ["title", "Chapter titles"],
                  ["number", "Chapter numbers"],
                ]}
                onChange={(display) => onChange({ display })}
              />
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

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map(([option, label]) => (
        <div key={option} className="flex items-center gap-3">
          <input
            type="radio"
            id={`${id}-${option}`}
            name={id}
            checked={value === option}
            onChange={() => onChange(option)}
            className="size-4 accent-primary"
          />
          <Label htmlFor={`${id}-${option}`} className="font-normal">
            {label}
          </Label>
        </div>
      ))}
    </fieldset>
  );
}
