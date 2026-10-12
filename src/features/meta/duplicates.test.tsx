// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { renderApp } from "@/test/render";

const pairs = () => screen.getByRole("list", { name: "Pairs" });
const pairOf = (id: number) => {
  const found = db().duplicates.find((p) => p.id === id);
  if (!found) throw new Error(`no pair ${id}`);
  return found;
};
const rowName = (id: number) => `${pairOf(id).entry_a.title} and ${pairOf(id).entry_b.title}`;

describe("duplicates", () => {
  it("list the pairs to review, most alike first, filtered from the URL", async () => {
    await renderApp("/admin/metadata?tab=duplicates");
    await waitFor(() => expect(within(pairs()).getAllByRole("link")).toHaveLength(4));
    expect(
      within(pairs())
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual([1, 2, 3, 4].map(rowName));
    expect(screen.getByText("4 pairs to review, most alike first")).toBeInTheDocument();
    expect(within(pairs()).getByText("Same work · 96%")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Alike at least" }), "90");
    await waitFor(() => expect(within(pairs()).getAllByRole("link")).toHaveLength(1));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Alike at least" }), "0");
    await userEvent.click(screen.getByRole("checkbox", { name: "Rated by the model" }));
    await waitFor(() => expect(within(pairs()).getAllByRole("link")).toHaveLength(2));
  });

  it("show a decided pair with its note", async () => {
    await renderApp("/admin/metadata?tab=duplicates&show=dismissed");
    expect(await screen.findByText("A sequel, not the same work.")).toBeInTheDocument();
  });

  it("merge a pair, keeping the one chosen, after asking", async () => {
    const { router } = await renderApp("/admin/metadata?tab=duplicates&pair=1");
    expect(await screen.findByRole("heading", { level: 2, name: "94% alike" })).toBeInTheDocument();
    expect(screen.getByText(/100% in common: Aoi Hanamura/)).toBeInTheDocument();
    expect(screen.getByText("example-db:5521")).toBeInTheDocument();
    expect(screen.getByText(/Same work 96% · Related work 3% · Different 1%/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Merge" }));
    const dialog = await screen.findByRole("dialog", { name: "Merge into one entry?" });
    await userEvent.click(within(dialog).getByRole("radio", { name: pairOf(1).entry_b.title }));
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Same series, two listings");
    await userEvent.click(within(dialog).getByRole("button", { name: "Merge for good" }));
    expect(await screen.findByText(`Merged: ${pairOf(1).entry_b.title} stays.`)).toBeInTheDocument();
    expect(pairOf(1)).toMatchObject({ status: "confirmed", note: "Same series, two listings", decided_by: "admin" });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("pair"));
  });

  it("keep a pair apart, and take it back", async () => {
    const { router } = await renderApp("/admin/metadata?tab=duplicates&pair=3");
    await userEvent.click(await screen.findByRole("button", { name: "Different works" }));
    const dialog = await screen.findByRole("dialog", { name: "Different works?" });
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Different authors");
    await userEvent.click(within(dialog).getByRole("button", { name: "Different works" }));
    expect(await screen.findByText("Kept apart as different works.")).toBeInTheDocument();
    expect(pairOf(3)).toMatchObject({ status: "dismissed", note: "Different authors" });

    await router.navigate({ to: "/admin/metadata", search: { tab: "duplicates", show: "dismissed", pair: 3 } });
    await userEvent.click(await screen.findByRole("button", { name: "Take back" }));
    expect(await screen.findByText("Back to review.")).toBeInTheDocument();
    expect(pairOf(3).status).toBe("open");
  });
});

describe("the decision model", () => {
  it("is tested without saving, then turned on, then reset to the configuration", async () => {
    await renderApp("/admin/metadata?tab=duplicates");
    const card = (await screen.findByRole("heading", { name: "Decision model" })).closest(
      "[data-slot=card]",
    ) as HTMLElement;
    expect(
      await within(card).findByText(/Off: nothing is sent to a model. From the service's configuration./),
    ).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Settings" }));
    let dialog = await screen.findByRole("dialog", { name: "Decision model" });
    const key = within(dialog).getByLabelText("API key");
    await userEvent.type(key, "wrong");
    await userEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "It didn't answer: The model service answered 401",
    );
    await userEvent.clear(key);
    await userEvent.type(key, "a-real-key");
    await userEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent("It answered: same work, 93% the same."),
    );
    expect(db().judge.enabled).toBe(false);

    await userEvent.click(within(dialog).getByRole("switch", { name: "Use the model" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The decision model is on.")).toBeInTheDocument();
    expect(db().judge).toMatchObject({ enabled: true, has_api_key: true, origin: "admin" });
    expect(db().judgeKey).toBe("a-real-key");
    expect(
      await within(card).findByText(/On: openai-compatible · example-model-small rates each pair/),
    ).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Settings" }));
    dialog = await screen.findByRole("dialog", { name: "Decision model" });
    expect(within(dialog).getByText("A key is saved: leave empty to keep it.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Use the configuration" }));
    expect(await screen.findByText("Back to the service's configuration.")).toBeInTheDocument();
    expect(db().judge).toMatchObject({ enabled: false, origin: "config" });
  });
});
