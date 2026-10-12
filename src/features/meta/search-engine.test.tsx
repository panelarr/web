// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POLL } from "@/features/jobs/use-jobs";
import { db } from "@/mocks/db";
import { tickJobs } from "@/mocks/jobs";
import { renderApp } from "@/test/render";

const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-slot=card]") as HTMLElement;
const saved = { ...POLL };

beforeEach(() => {
  POLL.runMs = 100;
  POLL.listMs = 100;
});
afterEach(() => {
  Object.assign(POLL, saved);
});

describe("the metadata service's search engine", () => {
  it("shows what answers now and how far the index is behind", async () => {
    await renderApp("/admin/metadata?tab=search");
    const status = await waitFor(() => card("Search now Healthy"));
    expect(within(status).getByText("Meilisearch answers searches.")).toBeInTheDocument();
    expect(within(status).getByText("47,188")).toBeInTheDocument();
    expect(within(status).getByText(/1,022 changes, the oldest/)).toBeInTheDocument();
    expect(within(status).getByText(/Finds parts of words/)).toHaveTextContent("Finds parts of words: no");
  });

  it("rebuilds the index through its job, and shows it up to date after", async () => {
    await renderApp("/admin/metadata?tab=search");
    await userEvent.click(await screen.findByRole("button", { name: "Rebuild the index" }));
    expect(await screen.findByText("Rebuilding the index…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch" })).toHaveAttribute(
      "href",
      expect.stringContaining("tab=jobs&job=search-rebuild&run="),
    );
    act(() => {
      for (let i = 0; i < 5; i++) tickJobs(db());
    });
    expect(await screen.findByText("Nothing: up to date")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Rebuild the index" })).toBeInTheDocument();
  });

  it("tests settings without saving, saves them over the configuration, and resets", async () => {
    await renderApp("/admin/metadata?tab=search");
    const settings = await waitFor(() => card("Settings"));
    expect(within(settings).getByText("A key is saved: leave empty to keep it.")).toBeInTheDocument();
    await userEvent.type(within(settings).getByLabelText("API key"), "wrong");
    await userEvent.click(within(settings).getByRole("button", { name: "Test" }));
    expect(await within(settings).findByRole("status")).toHaveTextContent(
      "It can't: The engine answered 401: the key was rejected.",
    );
    expect(db().searchEngine.settings.origin).toBe("config");

    await userEvent.selectOptions(within(settings).getByLabelText("Engine"), "postgres");
    expect(within(settings).queryByLabelText("URL")).not.toBeInTheDocument();
    await userEvent.click(within(settings).getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Search engine settings saved/)).toBeInTheDocument();
    expect(db().searchEngine.settings).toMatchObject({ backend: "postgres", origin: "admin" });
    expect(await screen.findByText("The database (built in) answers searches.")).toBeInTheDocument();

    await userEvent.click(await within(card("Settings")).findByRole("button", { name: "Use the configuration" }));
    expect(await screen.findByText("Back to the service's configuration.")).toBeInTheDocument();
    expect(db().searchEngine.settings).toMatchObject({ backend: "meilisearch", origin: "config" });
  });
});
