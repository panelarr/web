// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "@/test/render";
import { themeStore } from "@/theme/theme";

describe("app shell", () => {
  it("shows the library with the main navigation", async () => {
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    const navs = screen.getAllByRole("navigation", { name: "Main" });
    // The sidebar (desktop) and the bottom bar (phones); CSS shows one of them.
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      expect(within(nav).getByRole("link", { name: /Library/ })).toHaveAttribute("data-status", "active");
      expect(within(nav).getByRole("link", { name: /Browse/ })).not.toHaveAttribute("data-status", "active");
    }
  });

  it("shows the server version from the API", async () => {
    await renderApp("/");
    expect(await screen.findByText("Server dev")).toBeInTheDocument();
  });

  it("navigates between pages", async () => {
    const { router } = await renderApp("/");
    const [sidebar] = screen.getAllByRole("navigation", { name: "Main" });
    await userEvent.click(within(sidebar as HTMLElement).getByRole("link", { name: /Downloads/ }));
    expect(await screen.findByRole("heading", { name: "Downloads" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/downloads");
  });

  it("lists the other pages under More on phones", async () => {
    await renderApp("/more");
    const main = await screen.findByRole("main");
    expect(await within(main).findByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("highlights More on the pages it leads to", async () => {
    await renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    const bottom = screen.getAllByRole("navigation", { name: "Main" })[1] as HTMLElement;
    expect(within(bottom).getByRole("link", { name: "More" })).toHaveAttribute("data-status", "active");
  });

  it("answers unknown addresses with a not-found page", async () => {
    await renderApp("/no/such/page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("settings", () => {
  it("changes the theme", async () => {
    await renderApp("/settings");
    await userEvent.click(await screen.findByRole("radio", { name: "True black" }));
    expect(themeStore.state.theme).toBe("black");
    expect(screen.getByRole("radio", { name: "True black" })).toBeChecked();
  });
});
