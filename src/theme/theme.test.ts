// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, parseHex, readableOn } from "./color";
import { COLOR_TOKENS, THEME_PRESETS } from "./presets";
import { applyTheme, bootCache, DEFAULT_PREFS, resolve } from "./theme";

describe("colour helpers", () => {
  it("parses short and long hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("E0457B")).toEqual([224, 69, 123]);
    expect(parseHex("nope")).toBeUndefined();
  });

  it("picks the more readable text colour", () => {
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#ffff00")).toBe("#111111");
    const pink = parseHex("#E0457B") as [number, number, number];
    const text = parseHex(readableOn("#E0457B")) as [number, number, number];
    expect(contrastRatio(luminance(pink), luminance(text))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("presets", () => {
  it("set every colour token", () => {
    for (const preset of THEME_PRESETS) {
      for (const token of COLOR_TOKENS) expect(preset.colors[token], `${preset.id} ${token}`).toBeTruthy();
    }
  });

  it("include light, dark and true black", () => {
    expect(THEME_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(["light", "dark", "black"]));
  });
});

describe("resolve", () => {
  it("applies the accent as the primary colour", () => {
    const dark = THEME_PRESETS.find((p) => p.id === "dark");
    if (!dark) throw new Error("no dark preset");
    const theme = resolve(dark, { ...DEFAULT_PREFS, accent: "#3366ff" });
    expect(theme.dark).toBe(true);
    expect(theme.vars["--primary"]).toBe("#3366ff");
    expect(theme.vars["--ring"]).toBe("#3366ff");
    expect(theme.vars["--background"]).toBe(dark.colors.background);
  });

  it("falls back to the default accent for a bad colour", () => {
    const light = THEME_PRESETS[0];
    if (!light) throw new Error("no preset");
    expect(resolve(light, { ...DEFAULT_PREFS, accent: "red" }).vars["--primary"]).toBe(DEFAULT_PREFS.accent);
  });
});

describe("bootCache", () => {
  it("keeps a light and a dark theme when following the system", () => {
    const cache = bootCache({ ...DEFAULT_PREFS, theme: "system" });
    expect(cache.system).toBe(true);
    expect(cache.light.dark).toBe(false);
    expect(cache.dark.dark).toBe(true);
  });

  it("uses the chosen theme for both otherwise", () => {
    const cache = bootCache({ ...DEFAULT_PREFS, theme: "black" });
    expect(cache.system).toBe(false);
    expect(cache.light).toEqual(cache.dark);
    expect(cache.light.vars["--background"]).toBe("oklch(0 0 0)");
  });
});

describe("applyTheme", () => {
  it("sets the variables, the dark class and the browser theme colour", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    applyTheme(bootCache({ ...DEFAULT_PREFS, theme: "dark" }).light);
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--primary")).toBe(DEFAULT_PREFS.accent);
    expect(meta.content).toBe(root.style.getPropertyValue("--background"));
    applyTheme(bootCache({ ...DEFAULT_PREFS, theme: "light" }).light);
    expect(root.classList.contains("dark")).toBe(false);
    meta.remove();
  });
});

describe("custom colours", () => {
  it("override the background and surfaces, keeping text readable", () => {
    const dark = THEME_PRESETS.find((p) => p.id === "dark");
    if (!dark) throw new Error("no dark preset");
    const theme = resolve(dark, { ...DEFAULT_PREFS, background: "#f5f0e6", surface: "#ffffff" });
    expect(theme.vars["--background"]).toBe("#f5f0e6");
    expect(theme.vars["--foreground"]).toBe("#111111");
    expect(theme.vars["--card"]).toBe("#ffffff");
  });
});

describe("contrast", () => {
  it("reads hex and the presets' oklch colours", async () => {
    const { contrast, oklchToRgb } = await import("./color");
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0]);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("oklch(1 0 0)", "oklch(0.145 0 0)")).toBeGreaterThan(15);
    expect(contrast("nope", "#fff")).toBeUndefined();
  });
});
