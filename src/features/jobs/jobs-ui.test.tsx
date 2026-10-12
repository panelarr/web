// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { startRun, taskEvent, tickJobs } from "@/mocks/jobs";
import { renderApp } from "@/test/render";

const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-slot=card]") as HTMLElement;

describe("the jobs page", () => {
  it("lists jobs by group with their schedule and last run", async () => {
    await renderApp("/admin/jobs");
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maintenance" })).toBeInTheDocument();
    const update = card("Check for new chapters");
    expect(within(update).getByText(/Runs every 6 hours/)).toBeInTheDocument();
    expect(within(update).getByText("Succeeded")).toBeInTheDocument();
    expect(within(card("Clean up")).getByText(/Schedule off \(every day\)/)).toBeInTheDocument();
  });

  it("runs a job and follows it live until it's done", async () => {
    await renderApp("/admin/jobs");
    const sync = await waitFor(() => card("Refresh sources"));
    await userEvent.click(within(sync).getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Refresh sources started.")).toBeInTheDocument();
    expect(await within(card("Refresh sources")).findByText("Running")).toBeInTheDocument();

    // The server reports progress over the event stream.
    act(() => {
      tickJobs(db());
    });
    expect(await within(card("Refresh sources")).findByText(/1 of 5/)).toBeInTheDocument();
    act(() => {
      for (let i = 0; i < 5; i++) tickJobs(db());
    });
    expect(
      await within(card("Refresh sources")).findByText(/Done: 12 works/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("asks for a job's parameters and sends only what changed", async () => {
    await renderApp("/admin/jobs");
    const match = await waitFor(() => card("Match works on sources"));
    await userEvent.click(within(match).getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch", { name: "only_unmatched" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "example:1001" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "example:1003" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(db().runs[0]?.params).toEqual({ only_unmatched: "false", sources: "example:1001,example:1003" });
  });

  it("offers the running run when someone else started the job", async () => {
    const { router } = await renderApp("/admin/jobs");
    const update = await waitFor(() => card("Check for new chapters"));
    // The schedule started it meanwhile; the page hasn't heard yet, so the button is still there.
    const job = db().jobs.find((j) => j.id === "update-check");
    if (job) {
      job.running = true;
      job.current_run_id = "0b0e1e2d-3c4b-4a5f-8e7d-6c5b4a3f2e1d";
    }
    await userEvent.click(within(update).getByRole("button", { name: "Run now" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Check for new chapters is already running.")).toBeInTheDocument();
    // The error names the run that is going: "Watch" opens it.
    await userEvent.click(screen.getByRole("button", { name: "Watch" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/jobs/update-check/runs/0b0e1e2d-3c4b-4a5f-8e7d-6c5b4a3f2e1d"),
    );
  });

  it("cancels a running run", async () => {
    const job = db().jobs.find((j) => j.id === "update-check");
    const run = job ? startRun(db(), job, {}, "manual") : undefined;
    await renderApp("/admin/jobs");
    await userEvent.click(
      await within(await waitFor(() => card("Check for new chapters"))).findByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(run?.summary.status).toBe("cancelled"));
  });
});

describe("a job's runs", () => {
  it("filter by status from the URL and open a run with its notes", async () => {
    const { router } = await renderApp("/admin/jobs/update-check?status=failed");
    expect(await screen.findByText("2 sources failed")).toBeInTheDocument();
    expect(screen.queryByText(/Checked 42 works/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("2 sources failed"));
    expect(await screen.findByText("Sample Scans answered 503")).toBeInTheDocument();
    expect(screen.getByText("Gave up after 3 tries")).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/admin\/jobs\/update-check\/runs\//);
  });
});

describe("the queue", () => {
  it("shows each kind and pauses one", async () => {
    await renderApp("/admin/queue");
    const kind = (await screen.findByText("download.chapter", { selector: "p" })).closest("li") as HTMLElement;
    expect(within(kind).getByText(/1\/2 running · 1 queued/)).toBeInTheDocument();
    await userEvent.click(within(kind).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(db().pausedKinds).toEqual(["download.chapter"]));
    expect(await within(kind).findByText("Paused: queued tasks wait")).toBeInTheDocument();
  });

  it("filters tasks and retries a failed one", async () => {
    await renderApp("/admin/queue?state=failed");
    expect(await screen.findByText("Sample Scans timed out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(db().tasks.find((t) => t.kind === "match.work")?.state).toBe("queued"));
  });

  it("shows download progress live, without refetching", async () => {
    await renderApp("/admin/queue?state=running");
    expect(await screen.findByText(/7 of 22/)).toBeInTheDocument();
    const task = db().tasks.find((t) => t.state === "running");
    if (!task) throw new Error("no running task");
    task.progress = { phase: "pages", done: 15, total: 22, unit: "pages" };
    act(() => taskEvent("task.progress", task));
    expect(await screen.findByText(/15 of 22/)).toBeInTheDocument();
  });
});
