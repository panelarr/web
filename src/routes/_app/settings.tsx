// SPDX-License-Identifier: GPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Monitor } from "lucide-react";
import { PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { THEME_PRESETS } from "@/theme/presets";
import { setThemePrefs, themeStore } from "@/theme/theme";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <AppearanceCard />
    </>
  );
}

function AppearanceCard() {
  const theme = useSelector(themeStore, (prefs) => prefs.theme);
  const options = [
    { id: "system", name: "System", swatch: undefined },
    ...THEME_PRESETS.map((preset) => ({ id: preset.id, name: preset.name, swatch: preset.colors })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>The theme for this device.</CardDescription>
      </CardHeader>
      <CardContent>
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
                  checked={theme === option.id}
                  onChange={() => setThemePrefs({ theme: option.id })}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="flex h-14 items-center justify-center rounded-md border"
                  style={
                    option.swatch
                      ? { background: option.swatch.background, color: option.swatch.foreground }
                      : undefined
                  }
                >
                  {option.swatch ? <span className="text-base font-semibold">Aa</span> : <Monitor className="size-5" />}
                </span>
                <span className="px-1 font-medium">{option.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
