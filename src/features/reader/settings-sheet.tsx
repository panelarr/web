// SPDX-License-Identifier: GPL-3.0-or-later

import { useId } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { isContinuous, type Level, type ReaderSettings } from "./settings";
import type { SaveLevel } from "./use-reader-settings";

const LEVEL_LABEL: Record<Level, string> = {
  work: "This series",
  source: "Source",
  global: "Everywhere",
  default: "Default",
};

type Options<K extends keyof ReaderSettings> = ReadonlyArray<[ReaderSettings[K], string]>;

const MODE: Options<"mode"> = [
  ["single", "Single page"],
  ["double", "Double page"],
  ["vertical", "Vertical scroll"],
  ["webtoon", "Webtoon (no gaps)"],
  ["horizontal", "Horizontal scroll"],
];
const DIRECTION: Options<"direction"> = [
  ["rtl", "Right to left"],
  ["ltr", "Left to right"],
];
const FIT: Options<"fit"> = [
  ["screen", "Fit screen"],
  ["width", "Fit width"],
  ["height", "Fit height"],
  ["original", "Original size"],
];
const TAP: Options<"tapZones"> = [
  ["edge", "Edges"],
  ["kindle", "Kindle-like"],
  ["lshape", "L shape"],
  ["sides", "Halves"],
  ["off", "Off (menu only)"],
];
const TRANSITION: Options<"transition"> = [
  ["slide", "Slide"],
  ["fade", "Fade"],
  ["none", "None"],
];
const BACKGROUND: Options<"background"> = [
  ["theme", "Theme"],
  ["black", "Black"],
  ["gray", "Gray"],
  ["white", "White"],
];

/** In 7b: double page and horizontal scroll. */
const NOT_YET: ReadonlyArray<ReaderSettings["mode"]> = ["double", "horizontal"];

/**
 * The reader's settings, changed live. Each says where its value comes from; changes are
 * saved for this series, this source or everywhere.
 */
export function ReaderSettingsSheet({
  open,
  onOpenChange,
  settings,
  origin,
  level,
  onLevelChange,
  sourceName,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReaderSettings;
  origin: Record<keyof ReaderSettings, Level>;
  level: SaveLevel;
  onLevelChange: (level: SaveLevel) => void;
  sourceName: string;
  onChange: (change: Partial<ReaderSettings>) => void;
  onReset: (level: SaveLevel) => void;
}) {
  const desktop = useIsDesktop();
  const continuous = isContinuous(settings.mode);
  const select = <K extends keyof ReaderSettings>(
    key: K,
    label: string,
    options: Options<K>,
    disabled?: (v: ReaderSettings[K]) => boolean,
  ) => (
    <Row key={key} label={label} origin={origin[key]}>
      {(id) => (
        <NativeSelect
          id={id}
          value={String(settings[key])}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<ReaderSettings>)}
        >
          {options.map(([value, text]) => (
            <option key={String(value)} value={String(value)} disabled={disabled?.(value)}>
              {text}
              {disabled?.(value) ? " (soon)" : ""}
            </option>
          ))}
        </NativeSelect>
      )}
    </Row>
  );
  const toggle = (key: "stretch" | "invertTapZones" | "showPageNumber", label: string) => (
    <Row key={key} label={label} origin={origin[key]} inline>
      {(id) => <Switch id={id} checked={settings[key]} onCheckedChange={(checked) => onChange({ [key]: checked })} />}
    </Row>
  );
  const number = (key: "pageGap" | "maxWidth" | "preload", label: string, min: number, max: number, step: number) => (
    <Row key={key} label={label} origin={origin[key]}>
      {(id) => (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={settings[key]}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value)) onChange({ [key]: Math.min(max, Math.max(min, value)) });
          }}
        />
      )}
    </Row>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-md" : "max-h-[80dvh] rounded-t-2xl pb-safe")}
      >
        <SheetHeader>
          <SheetTitle>Reader settings</SheetTitle>
          <SheetDescription>Changes apply right away.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-4 pb-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Save changes for</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["work", "This series"],
                  ["source", sourceName],
                  ["global", "Everywhere"],
                ] as const
              ).map(([value, text]) => (
                <label
                  key={value}
                  className={cn(
                    "cursor-pointer truncate rounded-md px-2 py-1.5 text-center text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    level === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="save-level"
                    value={value}
                    checked={level === value}
                    onChange={() => onLevelChange(value)}
                    className="sr-only"
                  />
                  {text}
                </label>
              ))}
            </div>
          </fieldset>
          <section className="grid gap-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reading</h3>
            {select("mode", "Mode", MODE, (v) => NOT_YET.includes(v))}
            {continuous ? null : select("direction", "Direction", DIRECTION)}
          </section>
          <section className="grid gap-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Display</h3>
            {continuous ? null : select("fit", "Fit", FIT)}
            {continuous ? null : toggle("stretch", "Stretch small pages")}
            {settings.mode === "vertical" ? number("pageGap", "Gap between pages (px)", 0, 64, 2) : null}
            {continuous ? number("maxWidth", "Widest page (px, 0 for none)", 0, 4000, 50) : null}
            {select("background", "Background", BACKGROUND)}
            {toggle("showPageNumber", "Page number")}
          </section>
          <section className="grid gap-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Controls</h3>
            {select("tapZones", "Tap zones", TAP)}
            {continuous ? null : toggle("invertTapZones", "Swap tap sides")}
            {continuous ? null : select("transition", "Page turn", TRANSITION)}
            {number("preload", "Pages to load ahead", 0, 20, 1)}
          </section>
          <section className="grid gap-2 border-t pt-4">
            <p className="text-xs text-muted-foreground">Back to the broader settings:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onReset("work")}>
                Reset this series
              </Button>
              <Button variant="outline" size="sm" onClick={() => onReset("source")}>
                Reset {sourceName}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  origin,
  inline,
  children,
}: {
  label: string;
  origin: Level;
  inline?: boolean;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn(inline ? "flex items-center justify-between gap-3" : "grid gap-1.5")}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            origin === "default" ? "text-muted-foreground" : "bg-primary/10 text-primary",
          )}
          title={`Set for: ${LEVEL_LABEL[origin]}`}
        >
          {LEVEL_LABEL[origin]}
        </span>
      </div>
      {children(id)}
    </div>
  );
}
