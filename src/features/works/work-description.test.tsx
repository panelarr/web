// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { addToLibrary } from "@/mocks/handlers";
import { mockUrl, problem } from "@/mocks/op";
import { tickMatching } from "@/mocks/works";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

let workId = "";
beforeEach(() => {
  for (const source of db().sources) source.health = { status: "ok" };
  const user = db().users[0];
  if (!user) throw new Error("no user");
  addToLibrary(user, "ent_1000");
  tickMatching(db());
  workId = db().works[0]?.id ?? "";
});

describe("a work's description", () => {
  it("shows the first paragraph and the genres, and expands to the rest", async () => {
    await renderApp(`/works/${workId}`);
    const section = await screen.findByRole("region", { name: "Description" });
    expect(within(section).getByText(/follows a small cast through an unusual year/)).toBeInTheDocument();
    expect(within(section).queryByText("Made-up text for the mock catalogue.")).not.toBeInTheDocument();
    const genres = within(section).getByRole("list", { name: "Genres" });
    expect(within(genres).getAllByRole("listitem").length).toBeGreaterThan(0);

    const more = within(section).getByRole("button", { name: "More of the description" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(within(section).getByText("Made-up text for the mock catalogue.")).toBeInTheDocument();
    const less = within(section).getByRole("button", { name: "Less of the description" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(less);
    expect(within(section).queryByText("Made-up text for the mock catalogue.")).not.toBeInTheDocument();
  });

  it("isn't there when the metadata service fails, and the chapters show anyway", async () => {
    let asked = 0;
    server.use(
      http.get(mockUrl("/catalog/entries/{entry_id}"), () => {
        asked++;
        return problem(503, "meta_unavailable", "The metadata service isn't connected", "Connect it first.");
      }),
    );
    await renderApp(`/works/${workId}`);
    expect(await screen.findByText(/^\d+ chapters/)).toBeInTheDocument();
    // Failed (tests don't retry): no section and no error on the page.
    await waitFor(() => expect(asked).toBe(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Description" })).not.toBeInTheDocument();
  });

  it("doesn't hold up the chapters while the metadata service is slow", async () => {
    server.use(
      http.get(mockUrl("/catalog/entries/{entry_id}"), async () => {
        await delay("infinite");
      }),
    );
    await renderApp(`/works/${workId}`);
    expect(await screen.findByText(/^\d+ chapters/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Description" })).not.toBeInTheDocument();
  });
});
