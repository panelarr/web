// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POLL } from "@/features/jobs/use-jobs";
import { db } from "@/mocks/db";
import { tickMetaSyncs } from "@/mocks/meta";
import { renderApp } from "@/test/render";

const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-slot=card]") as HTMLElement;
const saved = { ...POLL };

// meta sends no events: the app polls while a sync runs.
beforeEach(() => {
  POLL.runMs = 100;
  POLL.listMs = 100;
});
afterEach(() => {
  Object.assign(POLL, saved);
});

describe("the metadata service's page", () => {
  it("shows its health per component", async () => {
    await renderApp("/admin/metadata");
    const health = await waitFor(() => card("Health"));
    expect(await within(health).findByText("Provider example-provider")).toBeInTheDocument();
    expect(within(health).getByText(/1 022 entries behind/)).toBeInTheDocument();
    expect(within(health).getByText(/Metadata service 0.9.0/)).toBeInTheDocument();
  });

  it("shows each provider with its schedules, records and last runs", async () => {
    await renderApp("/admin/metadata?tab=providers");
    const provider = await waitFor(() => card("Example Provider"));
    expect(within(provider).getByText("48,210 records")).toBeInTheDocument();
    expect(within(provider).getByText("Full sync: daily at 03:00 UTC")).toBeInTheDocument();
    expect(within(provider).getByText("Changes: every hour")).toBeInTheDocument();
    expect(within(provider).getByText("The provider answered 429 Too Many Requests")).toBeInTheDocument();
    expect(within(provider).getByText(/312 received · 41 changed · 4 merged/)).toBeInTheDocument();
  });

  it("starts a sync and follows it to the end", async () => {
    const { router } = await renderApp("/admin/metadata?tab=providers");
    const provider = await waitFor(() => card("Example Provider"));
    await userEvent.click(within(provider).getByRole("button", { name: "Start a full sync" }));
    expect(await screen.findByText("Full sync of example-provider started.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Watch" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "providers", provider: "example-provider" }),
    );
    const heading = () => screen.getByRole("heading", { level: 2, name: /Full sync of example-provider/ });
    await waitFor(() => expect(heading()).toHaveTextContent("Running"));
    act(() => {
      for (let i = 0; i < 5; i++) tickMetaSyncs(db());
    });
    await waitFor(() => expect(heading()).toHaveTextContent("Succeeded"));
    expect(screen.getByText("45,000")).toBeInTheDocument();
  });

  it("lists a provider's sync runs and opens one with its notices", async () => {
    await renderApp("/admin/metadata?tab=providers&provider=example-provider");
    expect(await screen.findByRole("heading", { level: 2, name: "example-provider: sync runs" })).toBeInTheDocument();
    await userEvent.click(await screen.findByText("The provider answered 429 Too Many Requests"));
    expect(await screen.findByText("Rate limited; retrying in an hour")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "example-provider: sync runs" }));
    expect(await screen.findByText(/48,210 received/)).toBeInTheDocument();
  });
});

describe("a catalogue entry", () => {
  it("is refreshed from its providers by an admin, saying which failed", async () => {
    await renderApp("/catalog/ent_1002");
    await userEvent.click(await screen.findByRole("button", { name: "Refresh from providers" }));
    expect(
      await screen.findByText("Fresh data from example-provider. Failed: other-provider (The provider answered 503)."),
    ).toBeInTheDocument();
  });
});
