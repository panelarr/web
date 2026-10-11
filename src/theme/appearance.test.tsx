// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { renderApp } from "@/test/render";
import { themeFromStored } from "./sync";
import { themeStore } from "./theme";

const adminId = () => db().users[0]?.id ?? "";
const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe("appearance", () => {
  it("follows the account: its saved choices replace this device's", async () => {
    db().preferences[adminId()] = { version: 1, theme: { theme: "forest", accent: "#3E63DD", font: "lexend" } };
    await renderApp("/");
    await waitFor(() => expect(themeStore.state.theme).toBe("forest"));
    expect(cssVar("--primary")).toBe("#3E63DD");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(cssVar("--font-ui")).toContain("Lexend");
  });

  it("saves changes to the account", async () => {
    await renderApp("/settings?tab=appearance");
    await userEvent.click(await screen.findByRole("button", { name: "Blue" }));
    await userEvent.click(screen.getByRole("radio", { name: "Sepia" }));
    await userEvent.selectOptions(screen.getByLabelText("Font"), "atkinson");
    await waitFor(() =>
      expect(db().preferences[adminId()]).toMatchObject({
        version: 1,
        theme: { theme: "sepia", accent: "#3E63DD", font: "atkinson" },
      }),
    );
    expect(cssVar("--font-ui")).toContain("Atkinson Hyperlegible");
  });

  it("customises the background with readable text, and resets it", async () => {
    await renderApp("/settings?tab=appearance");
    const background = await screen.findByLabelText("Background");
    fireEvent.change(background, { target: { value: "#102030" } });
    await waitFor(() => expect(cssVar("--background")).toBe("#102030"));
    expect(cssVar("--foreground")).toBe("#ffffff");
    await userEvent.click(screen.getByRole("button", { name: "Use the theme's colours" }));
    await waitFor(() => expect(cssVar("--background")).not.toBe("#102030"));
  });

  it("warns when the accent is hard to see", async () => {
    themeStore.setState((p) => ({ ...p, theme: "light", accent: "#F4F4F4" }));
    await renderApp("/settings?tab=appearance");
    const card = (await screen.findByRole("heading", { name: "Appearance" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    expect(within(card).getByText("This accent is hard to see on this theme.")).toBeInTheDocument();
  });
});

describe("themeFromStored", () => {
  it("keeps only valid choices", () => {
    expect(themeFromStored({ theme: { theme: "nope", accent: "red", font: "lexend", background: "#abcdef" } })).toEqual(
      {
        font: "lexend",
        background: "#abcdef",
        surface: undefined,
      },
    );
    expect(themeFromStored(undefined)).toEqual({});
  });
});
