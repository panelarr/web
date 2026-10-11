// SPDX-License-Identifier: GPL-3.0-or-later

import { Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Field } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { type CatalogSort, SORT_LABELS, STATUS_LABELS, TYPE_LABELS } from "./labels";

/** The catalogue's search and filters, as kept in the URL. */
export interface CatalogSearch {
  q?: string | undefined;
  type?: string[] | undefined;
  status?: string[] | undefined;
  genre?: string[] | undefined;
  year_from?: number | undefined;
  year_to?: number | undefined;
  sort?: CatalogSort | undefined;
  reverse?: boolean | undefined;
}

/** Genres to suggest while typing; any genre can be entered. */
export const COMMON_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

const strings = (value: unknown, max: number): string[] | undefined => {
  const list = (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 100)
    .slice(0, max);
  return list.length > 0 ? list : undefined;
};

const year = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1800 && n <= 3000 ? n : undefined;
};

/** Reads the search from the URL, dropping anything the server wouldn't accept. */
export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const out: CatalogSearch = {};
  if (typeof search.q === "string" && search.q.trim()) out.q = search.q.slice(0, 200);
  const type = strings(search.type, 20);
  if (type) out.type = type.filter((t) => /^[a-z_]{1,40}$/.test(t));
  const status = strings(search.status, 10);
  if (status) out.status = status.filter((s) => /^[a-z_]{1,40}$/.test(s));
  const genre = strings(search.genre, 20);
  if (genre) out.genre = genre;
  const from = year(search.year_from);
  if (from) out.year_from = from;
  const to = year(search.year_to);
  if (to) out.year_to = to;
  if (typeof search.sort === "string" && search.sort in SORT_LABELS) out.sort = search.sort as CatalogSort;
  if (search.reverse === true || search.reverse === "true") out.reverse = true;
  for (const key of ["type", "status"] as const) if (out[key]?.length === 0) delete out[key];
  return out;
}

/** How many filters are in use (not counting the search text and sort). */
export function countFilters(search: CatalogSearch): number {
  return (
    (search.type?.length ?? 0) +
    (search.status?.length ?? 0) +
    (search.genre?.length ?? 0) +
    (search.year_from || search.year_to ? 1 : 0)
  );
}

/** The filter panel: a side sheet on desktop, a bottom sheet on phones. Applies on "Show results". */
export function CatalogFilters({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CatalogSearch;
  onChange: (next: CatalogSearch) => void;
}) {
  const desktop = useIsDesktop();
  const [draft, setDraft] = useState<CatalogSearch>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const toggle = (key: "type" | "status" | "genre", item: string) => {
    const list = draft[key] ?? [];
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
    setDraft({ ...draft, [key]: next.length > 0 ? next : undefined });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-md" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the catalogue down.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 gap-6 overflow-y-auto px-4 pb-4">
          <ChipGroup
            legend="Type"
            options={Object.entries(TYPE_LABELS)}
            selected={draft.type ?? []}
            onToggle={(item) => toggle("type", item)}
          />
          <ChipGroup
            legend="Status"
            options={Object.entries(STATUS_LABELS).filter(([id]) => id !== "unknown")}
            selected={draft.status ?? []}
            onToggle={(item) => toggle("status", item)}
          />
          <GenrePicker selected={draft.genre ?? []} onToggle={(genre) => toggle("genre", genre)} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Years</legend>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                inputMode="numeric"
                aria-label="From year"
                placeholder="From"
                min={1800}
                max={3000}
                value={draft.year_from ?? ""}
                onChange={(e) => setDraft({ ...draft, year_from: year(e.target.value) })}
              />
              <Input
                type="number"
                inputMode="numeric"
                aria-label="To year"
                placeholder="To"
                min={1800}
                max={3000}
                value={draft.year_to ?? ""}
                onChange={(e) => setDraft({ ...draft, year_to: year(e.target.value) })}
              />
            </div>
          </fieldset>
          <SortFields draft={draft} onChange={setDraft} />
        </div>
        <SheetFooter className="flex-row gap-2 border-t">
          <Button variant="ghost" className="flex-1" onClick={() => setDraft({ ...(draft.q ? { q: draft.q } : {}) })}>
            Reset
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onChange(validateCatalogSearch({ ...draft }));
              onOpenChange(false);
            }}
          >
            Show results
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: Array<[string, string]>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <Chip key={id} pressed={selected.includes(id)} onClick={() => onToggle(id)}>
            {text}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        pressed ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function GenrePicker({ selected, onToggle }: { selected: string[]; onToggle: (genre: string) => void }) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = () => {
    const genre = text.trim();
    if (genre && !selected.includes(genre)) onToggle(genre);
    setText("");
  };
  const suggestions = COMMON_GENRES.filter((g) => !selected.includes(g));
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Genres</legend>
      <p className="mb-2 text-xs text-muted-foreground">Works with all of these.</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {selected.map((genre) => (
          <Chip key={genre} pressed onClick={() => onToggle(genre)}>
            {genre}
          </Chip>
        ))}
        {suggestions.slice(0, 8).map((genre) => (
          <Chip key={genre} pressed={false} onClick={() => onToggle(genre)}>
            {genre}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Another genre"
          placeholder="Another genre"
          list={listId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <datalist id={listId}>
          {suggestions.map((genre) => (
            <option key={genre} value={genre} />
          ))}
        </datalist>
        <Button type="button" variant="outline" size="icon" aria-label="Add genre" onClick={add}>
          <Plus aria-hidden />
        </Button>
      </div>
    </fieldset>
  );
}

function SortFields({ draft, onChange }: { draft: CatalogSearch; onChange: (next: CatalogSearch) => void }) {
  const reverseId = useId();
  return (
    <div className="grid gap-3">
      <Field label="Sort by">
        {(aria) => (
          <NativeSelect
            {...aria}
            value={draft.sort ?? ""}
            onChange={(e) => onChange({ ...draft, sort: (e.target.value || undefined) as CatalogSort | undefined })}
          >
            <option value="">{draft.q ? "Best match" : "Default"}</option>
            {Object.entries(SORT_LABELS)
              .filter(([id]) => id !== "relevance")
              .map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
          </NativeSelect>
        )}
      </Field>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={reverseId}>Reverse order</Label>
        <Switch
          id={reverseId}
          checked={draft.reverse ?? false}
          onCheckedChange={(reverse) => onChange({ ...draft, reverse: reverse || undefined })}
        />
      </div>
    </div>
  );
}
