// SPDX-License-Identifier: GPL-3.0-or-later

import { ArrowDownWideNarrow, ArrowUpNarrowWide, CheckIcon, RotateCcw, XIcon } from "lucide-react";
import { useId, useMemo } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { label, STATUS_LABELS, TYPE_LABELS } from "@/features/catalog/labels";
import type { LibraryEntry } from "@/features/catalog/library-index";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  ADULT,
  type Ceiling,
  FILTERS,
  type Filter,
  type FilterMode,
  filterCounts,
  type Layout,
  type LibraryView,
  NOT_ADULT,
  RATINGS,
  type Rating,
  ratingCounts,
  SORTS,
  type Sort,
  seesAdult,
  UPDATED_WITHIN,
  valuesIn,
} from "./library-view";

/** Off → include → exclude → off. */
const NEXT_MODE: Record<FilterMode | "off", FilterMode | undefined> = {
  off: "include",
  include: "exclude",
  exclude: undefined,
};

/** One sheet for a library view: what to show, in what order, and how. */
export function LibrarySheet({
  open,
  onOpenChange,
  name,
  view,
  entries,
  ceiling,
  isDefault,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The view being edited. */
  name: string;
  view: LibraryView;
  /** The whole library, for the counts and the types and statuses in it. */
  entries: readonly LibraryEntry[];
  /** The strongest content rating the user may see (the server already left out the rest). */
  ceiling: Ceiling;
  /** Whether this is the user's default view (it gets the hint to keep 18+ works apart). */
  isDefault: boolean;
  onChange: (change: Partial<LibraryView>) => void;
  /** Puts the view back to the defaults; undefined when it can't be (nothing saved yet). */
  onReset?: (() => void) | undefined;
}) {
  const desktop = useIsDesktop();
  const counts = useMemo(() => filterCounts(entries), [entries]);
  const types = useMemo(() => valuesIn(entries, "type", view.types), [entries, view.types]);
  const statuses = useMemo(() => valuesIn(entries, "status", view.statuses), [entries, view.statuses]);
  const ratings = useMemo(
    () => ratingCounts(entries, ceiling, view.contentRatings),
    [entries, ceiling, view.contentRatings],
  );
  const adult = seesAdult(ceiling);
  const adultHere = ratings.some(({ value, count }) => ADULT.includes(value) && count > 0);
  const hint = isDefault && adult && adultHere && view.contentRatings.length === 0;
  const cycle = (filter: Filter) => {
    const next = NEXT_MODE[view.filters[filter] ?? "off"];
    const { [filter]: _, ...rest } = view.filters;
    onChange({ filters: next ? { ...rest, [filter]: next } : rest });
  };
  const toggleValue = (list: readonly string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-sm" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="truncate pr-8">{name}</SheetTitle>
          <SheetDescription className="sr-only">Filter, sort and show this view of your library.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="filter" className="flex min-h-0 flex-1 flex-col gap-0 pt-2">
          <TabsList className="mx-4 grid w-auto grid-cols-3">
            <TabsTrigger value="filter">Filter</TabsTrigger>
            <TabsTrigger value="sort">Sort</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
          </TabsList>
          <div className="overflow-y-auto px-4 py-4">
            <TabsContent value="filter" className="grid gap-5">
              {hint ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <p className="min-w-0 flex-1">Tip: hide 18+ here and keep a separate view for it.</p>
                  <Button variant="outline" size="sm" onClick={() => onChange({ contentRatings: NOT_ADULT })}>
                    Hide 18+
                  </Button>
                </div>
              ) : null}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-medium">Works that are</legend>
                {(Object.keys(FILTERS) as Filter[]).map((filter) => (
                  <TriState
                    key={filter}
                    label={`${FILTERS[filter]} (${counts[filter]})`}
                    mode={view.filters[filter]}
                    onToggle={() => cycle(filter)}
                  />
                ))}
                <p className="text-xs text-muted-foreground">Tap again to leave those out, and again to clear.</p>
              </fieldset>
              {types.length > 0 ? (
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-sm font-medium">Type</legend>
                  {types.map(({ value, count }) => (
                    <Check
                      key={value}
                      label={`${label(TYPE_LABELS, value)} (${count})`}
                      checked={view.types.includes(value)}
                      onChange={(on) => onChange({ types: toggleValue(view.types, value, on) })}
                    />
                  ))}
                </fieldset>
              ) : null}
              {statuses.length > 0 ? (
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-sm font-medium">Status</legend>
                  {statuses.map(({ value, count }) => (
                    <Check
                      key={value}
                      label={`${label(STATUS_LABELS, value)} (${count})`}
                      checked={view.statuses.includes(value)}
                      onChange={(on) => onChange({ statuses: toggleValue(view.statuses, value, on) })}
                    />
                  ))}
                </fieldset>
              ) : null}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-medium">Content rating</legend>
                {adult ? (
                  <div className="flex flex-wrap gap-2">
                    <QuickPick
                      label="Hide 18+"
                      ratings={NOT_ADULT}
                      chosen={view.contentRatings}
                      onPick={(contentRatings) => onChange({ contentRatings })}
                    />
                    <QuickPick
                      label="Only 18+"
                      ratings={ADULT}
                      chosen={view.contentRatings}
                      onPick={(contentRatings) => onChange({ contentRatings })}
                    />
                  </div>
                ) : null}
                {ratings.map(({ value, count }) => (
                  <Check
                    key={value}
                    label={`${RATINGS[value]} (${count})`}
                    checked={view.contentRatings.includes(value)}
                    onChange={(on) => onChange({ contentRatings: toggleRating(view.contentRatings, value, on) })}
                  />
                ))}
                <p className="text-xs text-muted-foreground">
                  Shows only works with the ticked ratings.{adult ? " Erotic and Pornographic are 18+." : ""} Unrated
                  works have no rating in the metadata.
                </p>
              </fieldset>
              <UpdatedWithin
                days={view.updatedWithinDays}
                onChange={(updatedWithinDays) => onChange({ updatedWithinDays })}
              />
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
              <p className="mt-2 text-xs text-muted-foreground">
                Tap the chosen one again to reverse it. Recently updated is when Panelarr last found a new chapter.
              </p>
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
            {onReset ? (
              <Button variant="outline" size="sm" className="mt-6 w-full" onClick={onReset}>
                <RotateCcw aria-hidden />
                Reset view
              </Button>
            ) : null}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/** Ratings toggled, kept in the fixed mild-to-strong order. */
function toggleRating(list: readonly Rating[], value: Rating, on: boolean): Rating[] {
  return (Object.keys(RATINGS) as Rating[]).filter((r) => (r === value ? on : list.includes(r)));
}

const sameRatings = (a: readonly Rating[], b: readonly Rating[]) =>
  a.length === b.length && a.every((r) => b.includes(r));

/** Sets the ratings to a preset; pressed while the view holds exactly those, and pressing it then clears them. */
function QuickPick({
  label,
  ratings,
  chosen,
  onPick,
}: {
  label: string;
  ratings: readonly Rating[];
  chosen: readonly Rating[];
  onPick: (ratings: readonly Rating[]) => void;
}) {
  const pressed = sameRatings(ratings, chosen);
  return (
    <Button
      variant={pressed ? "secondary" : "outline"}
      size="sm"
      aria-pressed={pressed}
      className={cn(pressed && "text-primary")}
      onClick={() => onPick(pressed ? [] : ratings)}
    >
      {label}
    </Button>
  );
}

/**
 * A filter that keeps (✓) or leaves out (✕) what it matches: a checkbox, checked when it
 * keeps, indeterminate ("mixed") when it leaves out, said in its description too.
 */
function TriState({ label, mode, onToggle }: { label: string; mode: FilterMode | undefined; onToggle: () => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid size-4 shrink-0 place-content-center">
        <input
          type="checkbox"
          id={id}
          // Indeterminate is "mixed" to assistive tech: leaving out.
          ref={(input) => {
            if (input) input.indeterminate = mode === "exclude";
          }}
          checked={mode === "include"}
          aria-describedby={mode ? `${id}-state` : undefined}
          onChange={onToggle}
          className={cn(
            "peer absolute inset-0 size-4 cursor-pointer appearance-none rounded-[4px] border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
            mode === "include" && "border-primary bg-primary dark:bg-primary",
            mode === "exclude" && "border-destructive bg-destructive dark:bg-destructive",
          )}
        />
        {mode === "include" ? (
          <CheckIcon className="pointer-events-none relative size-3.5 text-primary-foreground" aria-hidden />
        ) : null}
        {mode === "exclude" ? <XIcon className="pointer-events-none relative size-3.5 text-white" aria-hidden /> : null}
      </span>
      <Label htmlFor={id} className={cn("font-normal", mode === "exclude" && "line-through decoration-1")}>
        {label}
      </Label>
      {mode ? (
        <span id={`${id}-state`} className="sr-only">
          {mode === "include" ? "Only these" : "Left out"}
        </span>
      ) : null}
    </div>
  );
}

function UpdatedWithin({ days, onChange }: { days: number | undefined; onChange: (days: number | undefined) => void }) {
  const id = useId();
  const choices: number[] = [...UPDATED_WITHIN];
  // A number set elsewhere (another app) still shows.
  if (days && !choices.includes(days)) choices.push(days);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-medium">
        Updated within
      </Label>
      <NativeSelect
        id={id}
        value={days ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">Any time</option>
        {choices
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 day" : `${n} days`}
            </option>
          ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">Works with a new chapter found in that time.</p>
    </div>
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
