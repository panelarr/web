// SPDX-License-Identifier: GPL-3.0-or-later

import { RotateCcw } from "lucide-react";
import { useId } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ["auto", "Match the page"],
  ["black", "Black"],
  ["gray", "Gray"],
  ["white", "White"],
];

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
  onClear,
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
  /** Drops one setting at the level being changed. */
  onClear: (setting: keyof ReaderSettings) => void;
}) {
  const desktop = useIsDesktop();
  const scopeName = level === "source" ? sourceName : LEVEL_LABEL[level].toLowerCase();
  const row = { level, scopeName, onClear };
  const continuous = isContinuous(settings.mode);
  const select = <K extends keyof ReaderSettings>(
    key: K,
    label: string,
    options: Options<K>,
    disabled?: (v: ReaderSettings[K]) => boolean,
  ) => (
    <Row key={key} setting={key} label={label} origin={origin[key]} {...row}>
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
  const toggle = (
    key: "stretch" | "invertTapZones" | "showPageNumber" | "offsetSpreads" | "keepAwake",
    label: string,
  ) => (
    <Row key={key} setting={key} label={label} origin={origin[key]} inline {...row}>
      {(id) => <Switch id={id} checked={settings[key]} onCheckedChange={(checked) => onChange({ [key]: checked })} />}
    </Row>
  );
  const number = (key: "pageGap" | "maxWidth" | "preload", label: string, min: number, max: number, step: number) => (
    <Row key={key} setting={key} label={label} origin={origin[key]} {...row}>
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
        <SheetHeader className="pb-2">
          <SheetTitle>Reader settings</SheetTitle>
          <SheetDescription>Changes apply right away.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4">
          <fieldset>
            <legend className="sr-only">Save changes for</legend>
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
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">•</span> set for {scopeName}; the others come from broader
            settings.
          </p>
        </div>
        <Tabs defaultValue="layout" className="flex min-h-0 flex-1 flex-col gap-0 pt-3">
          <TabsList className="mx-4 grid w-auto grid-cols-2">
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
            <TabsContent value="layout" className="grid gap-4">
              {select("mode", "Mode", MODE)}
              {settings.mode === "vertical" || settings.mode === "webtoon"
                ? null
                : select("direction", "Direction", DIRECTION)}
              {settings.mode === "double" ? toggle("offsetSpreads", "Cover alone (pairs printed pages)") : null}
              {continuous || settings.mode === "double" ? null : select("fit", "Fit", FIT)}
              {continuous ? null : toggle("stretch", "Stretch small pages")}
              {settings.mode === "vertical" || settings.mode === "horizontal"
                ? number("pageGap", "Gap between pages (px)", 0, 64, 2)
                : null}
              {settings.mode === "vertical" || settings.mode === "webtoon"
                ? number("maxWidth", "Widest page (px, 0 for none)", 0, 4000, 50)
                : null}
              {select("tapZones", "Tap zones", TAP)}
              {continuous ? null : toggle("invertTapZones", "Swap tap sides")}
            </TabsContent>
            <TabsContent value="general" className="grid gap-4">
              {select("background", "Background", BACKGROUND)}
              {toggle("showPageNumber", "Page number")}
              {toggle("keepAwake", "Keep the screen on")}
              {continuous ? null : select("transition", "Page turn", TRANSITION)}
              {number("preload", "Pages to load ahead", 0, 20, 1)}
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
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  setting,
  label,
  origin,
  inline,
  level,
  scopeName,
  onClear,
  children,
}: {
  setting: keyof ReaderSettings;
  label: string;
  origin: Level;
  inline?: boolean;
  level: SaveLevel;
  scopeName: string;
  onClear: (setting: keyof ReaderSettings) => void;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  const here = origin === level;
  return (
    <div className={cn(inline ? "flex items-center justify-between gap-3" : "grid gap-1.5")}>
      <div className="flex min-w-0 items-center gap-2">
        <Label htmlFor={id}>
          {label}
          {here ? (
            <span className="text-primary" title={`Set for ${scopeName}`}>
              {" "}
              •<span className="sr-only"> (set for {scopeName})</span>
            </span>
          ) : null}
        </Label>
        {here ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={`Reset ${label}`}
            title="Reset"
            onClick={() => onClear(setting)}
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </Button>
        ) : origin !== "default" ? (
          <span className="truncate text-[10px] text-muted-foreground">from {LEVEL_LABEL[origin].toLowerCase()}</span>
        ) : null}
      </div>
      {children(id)}
    </div>
  );
}
