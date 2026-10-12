// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { startRun, tickJobs } from "@/mocks/jobs";
import { renderApp } from "@/test/render";
import { POLL } from "./use-jobs";

const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-slot=card]") as HTMLElement;
const saved = { ...POLL };

// meta's and plugins' runs send no events: the app polls while they run.
beforeEach(() => {
  POLL.runMs = 100;
  POLL.listMs = 100;
});
afterEach(() => {
  Object.assign(POLL, saved);
});

describe("a plugin's jobs", () => {
  it("run from its page's Jobs tab and are followed by polling until done", async () => {
    await renderApp("/admin/plugins/stores?tab=jobs");
    expect(await screen.findByRole("heading", { name: "Stores" })).toBeInTheDocument();
    const refresh = card("Refresh stores");
    expect(within(refresh).getByText(/Runs every 6 hours/)).toBeInTheDocument();
    await userEvent.click(within(refresh).getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Refresh stores started.")).toBeInTheDocument();
    expect(await within(card("Refresh stores")).findByText("Running")).toBeInTheDocument();
    expect(db().pluginJobs.stores?.runs[0]?.summary.triggered_by).toBe("admin");

    act(() => {
      for (let i = 0; i < 5; i++) tickJobs(db());
    });
    expect(await within(card("Refresh stores")).findByText(/Done: 12 works/)).toBeInTheDocument();
  });

  it("open a job's runs and a run inside the tab, and back", async () => {
    const { router } = await renderApp("/admin/plugins/stores?tab=jobs");
    await userEvent.click(await screen.findByRole("link", { name: "Refresh stores: runs" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Refresh stores" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ tab: "jobs", job: "store-refresh" });
    await userEvent.click(await screen.findByText("2 stores, 5 updates"));
    expect(await screen.findByRole("heading", { name: "Outcome" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ tab: "jobs", job: "store-refresh" });
    expect(router.state.location.search.run).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Refresh stores" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Runs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "All jobs" }));
    expect(await screen.findByRole("heading", { name: "Health" })).toBeInTheDocument();
  });

  it("offer the running run, named in the plugin's own words, when it's already going", async () => {
    const { router } = await renderApp("/admin/plugins/stores?tab=jobs");
    const refresh = await waitFor(() => card("Refresh stores"));
    // The plugin's schedule started it; the page hasn't polled since.
    const store = db().pluginJobs.stores;
    const job = store?.jobs.find((j) => j.id === "store-refresh");
    if (!store || !job) throw new Error("no store-refresh job");
    const running = startRun(store, job, {}, "schedule");
    await userEvent.click(within(refresh).getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Refresh stores is already running.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Watch" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        tab: "jobs",
        job: "store-refresh",
        run: running.summary.id,
      }),
    );
  });

  it("that can't run now say why, paused, without Run now", async () => {
    await renderApp("/admin/plugins/stores?tab=jobs");
    const sync = await waitFor(() => card("Keep the configuration"));
    expect(within(sync).getByText(/Paused \(every 15 minutes\)/)).toBeInTheDocument();
    expect(within(sync).queryByText(/next/)).not.toBeInTheDocument();
    expect(
      within(sync).getByText(/Nothing to keep: no stores, extensions or health-check interval/),
    ).toBeInTheDocument();
    expect(within(sync).getByRole("button", { name: "Run now" })).toBeDisabled();
  });

  it("say why when one can no longer run, and show it as it is now", async () => {
    await renderApp("/admin/plugins/stores?tab=jobs");
    const refresh = await waitFor(() => card("Refresh stores"));
    // Its plugin disabled it since the page loaded.
    const job = db().pluginJobs.stores?.jobs.find((j) => j.id === "store-refresh");
    if (!job) throw new Error("no store-refresh job");
    job.disabled_reason = "No stores are configured";
    await userEvent.click(within(refresh).getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Refresh stores can't run now.")).toBeInTheDocument();
    expect(await within(card("Refresh stores")).findByText(/No stores are configured/)).toBeInTheDocument();
    expect(within(card("Refresh stores")).getByRole("button", { name: "Run now" })).toBeDisabled();
  });

  it("aren't offered by a plugin without them", async () => {
    await renderApp("/admin/plugins/example");
    expect(await screen.findByRole("tab", { name: "Network" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Jobs" })).not.toBeInTheDocument();
  });
});

describe("the metadata service's jobs", () => {
  it("show by group on its page, with runs it started itself", async () => {
    await renderApp("/admin/metadata?tab=jobs");
    expect(await screen.findByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(within(card("Rebuild the search index")).getByText(/by the metadata service/)).toBeInTheDocument();
    expect(within(card("Look for duplicates")).getByText("Failed")).toBeInTheDocument();
    // Its schedules are cron, in words.
    expect(within(card("Example Provider: full sync")).getByText(/Runs daily at 03:00 UTC/)).toBeInTheDocument();
    expect(within(card("Look for duplicates")).getByText(/Runs every Monday at 04:30 UTC/)).toBeInTheDocument();
  });

  it("run with parameters and filter runs by status from the URL", async () => {
    const { router } = await renderApp("/admin/metadata?tab=jobs");
    const sync = await waitFor(() => card("Example Provider: changes"));
    await userEvent.click(within(sync).getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Force" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(db().metaJobs.runs[0]?.params).toEqual({ force: "true" }));

    await router.navigate({ to: "/admin/metadata", search: { tab: "jobs", job: "duplicates-scan", status: "failed" } });
    expect(await screen.findByText("The judge didn't answer")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "succeeded");
    expect(await screen.findByText("No runs with this status")).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ status: "succeeded" });
  });

  it("can't rebuild a search index while the database searches directly", async () => {
    db().searchEngine.settings.backend = "postgres";
    await renderApp("/admin/metadata?tab=jobs");
    const rebuild = await waitFor(() => card("Rebuild the search index"));
    expect(await within(rebuild).findByText(/Only with a search engine/)).toBeInTheDocument();
    expect(within(rebuild).getByRole("button", { name: "Run now" })).toBeDisabled();
  });

  it("cancel a running run", async () => {
    const store = db().metaJobs;
    const job = store.jobs.find((j) => j.id === "search-rebuild");
    if (!job) throw new Error("no search-rebuild job");
    const running = startRun(store, job, {}, "manual", "admin");
    await renderApp("/admin/metadata?tab=jobs");
    await userEvent.click(
      await within(await waitFor(() => card("Rebuild the search index"))).findByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(running.summary.status).toBe("cancelled"));
    expect(await within(card("Rebuild the search index")).findByText("Cancelled")).toBeInTheDocument();
  });
});
