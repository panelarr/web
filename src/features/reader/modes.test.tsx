// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { unifiedChapters } from "@/mocks/chapters";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";

function openManga(settings: Record<string, unknown>) {
  const user = db().users[0];
  if (!user) throw new Error("no user");
  addToLibrary(user, "ent_1000");
  tickMatching(db());
  const work = db().works[0];
  const first = unifiedChapters(db(), work?.id ?? "", user.id)[0]?.chapter;
  db().readerSettings[user.id] = { global: { transition: "none", ...settings } };
  return renderApp(`/read/${first?.id}`);
}

const status = () => screen.getByText(/^Page \d+ of \d+$/);

describe("reading modes", () => {
  it("double page: the cover alone, then pages in pairs", async () => {
    await openManga({ mode: "double" });
    await screen.findByText("The Lantern Keeper");
    const viewer = screen.getByTestId("paged-viewer");
    expect(status()).toHaveTextContent("Page 1 of 11");
    await userEvent.keyboard("{ArrowLeft}");
    expect(status()).toHaveTextContent("Page 3 of 11");
    const current = within(viewer).getByAltText("Page 2").closest("[aria-hidden=false]") as HTMLElement;
    expect(within(current).getByAltText("Page 3")).toBeInTheDocument();
  });

  it("double page without the offset pairs from the first page", async () => {
    await openManga({ mode: "double", offsetSpreads: false });
    await screen.findByText("The Lantern Keeper");
    const current = within(screen.getByTestId("paged-viewer"))
      .getByAltText("Page 1")
      .closest("[aria-hidden=false]") as HTMLElement;
    expect(within(current).getByAltText("Page 2")).toBeInTheDocument();
  });

  it("horizontal scroll runs right to left for manga", async () => {
    await openManga({ mode: "horizontal" });
    expect(await screen.findByTestId("horizontal-viewer")).toHaveAttribute("dir", "rtl");
  });

  it("shows the tap zones for a moment after they change", async () => {
    await openManga({});
    await userEvent.click(await screen.findByRole("button", { name: "Reader settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Reader settings" });
    await userEvent.selectOptions(within(sheet).getByLabelText(/^Tap zones/), "kindle");
    expect(await screen.findByTestId("tap-zone-preview")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("tap-zone-preview")).not.toBeInTheDocument(), { timeout: 2500 });
  });
});
