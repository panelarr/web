// SPDX-License-Identifier: GPL-3.0-or-later

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Minus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { type FilterState, type FilterValue, initialState, type SourceFilter, type TriState } from "./filters";

/** A source's filters, drawn from what the source declares; applied with "Search". */
export function SourceFiltersSheet({
  open,
  onOpenChange,
  filters,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SourceFilter[];
  value: FilterState;
  onApply: (state: FilterState) => void;
}) {
  const desktop = useIsDesktop();
  const [draft, setDraft] = useState<FilterState>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  const set = (position: string, next: FilterValue) => setDraft({ ...draft, [position]: next });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-md" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>This source's own search filters.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-4 pb-4">
          {filters.map((filter, i) => (
            <FilterControl key={i} filter={filter} position={String(i)} state={draft} onChange={set} />
          ))}
        </div>
        <SheetFooter className="flex-row gap-2 border-t">
          <Button variant="ghost" className="flex-1" onClick={() => setDraft(initialState(filters))}>
            Reset
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Search
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterControl({
  filter,
  position,
  state,
  onChange,
}: {
  filter: SourceFilter;
  position: string;
  state: FilterState;
  onChange: (position: string, value: FilterValue) => void;
}) {
  const id = useId();
  const value = state[position];
  if (filter.header)
    return <p className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{filter.name}</p>;
  if (filter.separator) return <hr />;
  if (filter.group) {
    return (
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{filter.name}</legend>
        <div className="flex flex-wrap gap-2">
          {(filter.group.filters ?? []).map((child, j) => {
            const childPosition = `${position}.${j}`;
            const childValue = state[childPosition];
            if (childValue?.kind === "triState") {
              return (
                <TriStateChip
                  key={j}
                  name={child.name}
                  value={childValue.value}
                  onChange={(v) => onChange(childPosition, { kind: "triState", value: v })}
                />
              );
            }
            return (
              <div key={j} className="basis-full">
                <FilterControl filter={child} position={childPosition} state={state} onChange={onChange} />
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }
  switch (value?.kind) {
    case "text":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{filter.name}</Label>
          <Input
            id={id}
            value={value.value}
            onChange={(e) => onChange(position, { kind: "text", value: e.target.value })}
          />
        </div>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={value.value}
            onCheckedChange={(c) => onChange(position, { kind: "checkbox", value: c === true })}
          />
          <Label htmlFor={id} className="font-normal">
            {filter.name}
          </Label>
        </div>
      );
    case "triState":
      return (
        <TriStateChip
          name={filter.name}
          value={value.value}
          onChange={(v) => onChange(position, { kind: "triState", value: v })}
        />
      );
    case "select":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{filter.name}</Label>
          <NativeSelect
            id={id}
            value={value.value}
            onChange={(e) => onChange(position, { kind: "select", value: Number(e.target.value) })}
          >
            {(filter.select?.options ?? []).map((option, k) => (
              <option key={k} value={k}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </div>
      );
    case "sort": {
      const selection = value.value;
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{filter.name}</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <NativeSelect
                id={id}
                value={selection ? selection.index : ""}
                onChange={(e) =>
                  onChange(position, {
                    kind: "sort",
                    value:
                      e.target.value === ""
                        ? undefined
                        : { index: Number(e.target.value), ascending: selection?.ascending ?? false },
                  })
                }
              >
                <option value="">Source default</option>
                {(filter.sort?.options ?? []).map((option, k) => (
                  <option key={k} value={k}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!selection}
              aria-label={selection?.ascending ? "Ascending" : "Descending"}
              onClick={() =>
                selection &&
                onChange(position, { kind: "sort", value: { ...selection, ascending: !selection.ascending } })
              }
            >
              {selection?.ascending ? <ArrowUpNarrowWide aria-hidden /> : <ArrowDownWideNarrow aria-hidden />}
            </Button>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

const NEXT: Record<TriState, TriState> = {
  TRI_STATE_IGNORE: "TRI_STATE_INCLUDE",
  TRI_STATE_INCLUDE: "TRI_STATE_EXCLUDE",
  TRI_STATE_EXCLUDE: "TRI_STATE_IGNORE",
};

/** Tap to cycle: any → include → exclude. */
function TriStateChip({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  const state = value === "TRI_STATE_INCLUDE" ? "include" : value === "TRI_STATE_EXCLUDE" ? "exclude" : "any";
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT[value])}
      aria-label={`${name}: ${state === "any" ? "any" : state === "include" ? "included" : "excluded"}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
        state === "include" && "border-success bg-success/15 text-success",
        state === "exclude" && "border-destructive bg-destructive/10 text-destructive line-through",
        state === "any" && "hover:bg-accent",
      )}
    >
      {state === "include" ? (
        <Check className="size-3.5" aria-hidden />
      ) : state === "exclude" ? (
        <X className="size-3.5" aria-hidden />
      ) : (
        <Minus className="size-3.5 opacity-40" aria-hidden />
      )}
      {name}
    </button>
  );
}
