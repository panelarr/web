// SPDX-License-Identifier: GPL-3.0-or-later

import { useSelector } from "@tanstack/react-store";
import { Check, Monitor, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { readableOn, toHex } from "@/theme/color";
import { DEFAULT_ACCENT } from "@/theme/defaults";
import { findFont, UI_FONTS } from "@/theme/fonts";
import { ACCENT_SWATCHES, findPreset, THEME_PRESETS } from "@/theme/presets";
import { contrast, setThemePrefs, themeStore } from "@/theme/theme";

/** Theme, accent, colours and font: saved to the account, so every device looks the same. */
export function AppearanceCard() {
  const prefs = useSelector(themeStore, (p) => p);
  const preset = findPreset(prefs.theme === "system" ? "light" : prefs.theme) ?? THEME_PRESETS[0];
  const background = prefs.background ?? preset?.colors.background ?? "#ffffff";
  const accentContrast = contrast(prefs.accent, background);
  const options = [
    { id: "system", name: "System", swatch: undefined },
    ...THEME_PRESETS.map((p) => ({ id: p.id, name: p.name, swatch: p.colors })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Saved to your account: every device you sign in on looks the same.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Theme</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
            {options.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-accent",
                  "has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/40",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.id}
                  checked={prefs.theme === option.id}
                  onChange={() => setThemePrefs({ theme: option.id })}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="flex h-14 items-center justify-center gap-1.5 rounded-md border"
                  style={
                    option.swatch
                      ? { background: option.swatch.background, color: option.swatch.foreground }
                      : undefined
                  }
                >
                  {option.swatch ? (
                    <>
                      <span className="text-base font-semibold">Aa</span>
                      <span className="size-3 rounded-full" style={{ background: prefs.accent }} />
                    </>
                  ) : (
                    <Monitor className="size-5" />
                  )}
                </span>
                <span className="px-1 font-medium">{option.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-medium">Accent colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_SWATCHES.map(([hex, name]) => (
              <button
                key={hex}
                type="button"
                aria-label={name}
                aria-pressed={prefs.accent.toLowerCase() === hex.toLowerCase()}
                onClick={() => setThemePrefs({ accent: hex })}
                className="flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ background: hex }}
              >
                {prefs.accent.toLowerCase() === hex.toLowerCase() ? (
                  <Check className="size-4" style={{ color: readableOn(hex) }} aria-hidden />
                ) : null}
              </button>
            ))}
            <ColorInput label="Custom accent" value={prefs.accent} onChange={(accent) => setThemePrefs({ accent })} />
          </div>
          {accentContrast !== undefined && accentContrast < 2.5 ? (
            <ContrastWarning>This accent is hard to see on this theme.</ContrastWarning>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">Colours</legend>
          <p className="-mt-1 text-xs text-muted-foreground">
            Change the theme's background and surfaces. Text colour follows for contrast.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <ColorInput
              label="Background"
              value={background}
              onChange={(value) => setThemePrefs({ background: value })}
              showLabel
            />
            <ColorInput
              label="Surfaces"
              value={prefs.surface ?? preset?.colors.card ?? "#ffffff"}
              onChange={(value) => setThemePrefs({ surface: value })}
              showLabel
            />
            {prefs.background || prefs.surface ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setThemePrefs({ background: undefined, surface: undefined })}
              >
                Use the theme's colours
              </Button>
            ) : null}
          </div>
        </fieldset>

        <FontPicker />

        {prefs.accent !== DEFAULT_ACCENT ||
        prefs.background ||
        prefs.surface ||
        prefs.font !== "inter" ||
        prefs.theme !== "system" ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setThemePrefs({
                  theme: "system",
                  accent: DEFAULT_ACCENT,
                  font: "inter",
                  background: undefined,
                  surface: undefined,
                })
              }
            >
              Reset appearance
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FontPicker() {
  const font = useSelector(themeStore, (p) => p.font);
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Font</Label>
      <div className="max-w-xs">
        <NativeSelect id={id} value={findFont(font).id} onChange={(e) => setThemePrefs({ font: e.target.value })}>
          {UI_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-sm text-muted-foreground" style={{ fontFamily: findFont(font).family }}>
        The quick brown fox reads 12 chapters before breakfast.
      </p>
    </div>
  );
}

/** The browser's colour picker, labelled. */
function ColorInput({
  label,
  value,
  onChange,
  showLabel,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  showLabel?: boolean;
}) {
  const id = useId();
  const hex = toHex(value) ?? "#888888";
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={hex}
        aria-label={showLabel ? undefined : label}
        onChange={(e) => onChange(e.target.value)}
        className="size-9 cursor-pointer rounded-full border bg-transparent p-0.5 [&::-moz-color-swatch]:rounded-full [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0"
      />
      {showLabel ? (
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      ) : null}
    </div>
  );
}

function ContrastWarning({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-warning">
      <TriangleAlert className="size-3.5" aria-hidden />
      {children}
    </p>
  );
}
