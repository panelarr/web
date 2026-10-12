// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POLL } from "@/features/jobs/use-jobs";
import { db } from "@/mocks/db";
import { tickJobs } from "@/mocks/jobs";
import { mockUrl, problem } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const stores = () => screen.getByRole("heading", { name: "Stores" }).closest("section") as HTMLElement;
const storeRow = (name: string) => within(stores()).getByText(name).closest("li") as HTMLElement;
/** A Polyglot Comics source's row, by its language (its switch names it). */
const sourceRow = (lang: string) =>
  screen
    .getByRole("switch", { name: `Scheduled checks for Polyglot Comics (${lang})` })
    .closest("[data-index]") as HTMLElement;
const saved = { ...POLL };

beforeEach(() => {
  POLL.runMs = 100;
  POLL.listMs = 100;
});
afterEach(() => {
  Object.assign(POLL, saved);
});

describe("a plugin's stores", () => {
  it("show how their last refresh went, and refresh on request", async () => {
    await renderApp("/admin/plugins/stores?tab=extensions");
    await screen.findByRole("heading", { name: "Stores" });
    const main = await waitFor(() => storeRow("Main store"));
    expect(within(main).getByText(/204 extensions · refreshed/)).toBeInTheDocument();
    expect(within(main).getByText("7c:1e:9a:44:0b:d2:5f:83:e6:20:91:ab:3c:58:f0:12")).toBeInTheDocument();
    const mirror = storeRow("Mirror store");
    expect(within(mirror).getByText(/Last refresh failed: The store answered 503/)).toBeInTheDocument();

    await userEvent.click(within(mirror).getByRole("button", { name: "Refresh Mirror store now" }));
    expect(await screen.findByText("Mirror store: 203 extensions.")).toBeInTheDocument();
    await waitFor(() => expect(within(storeRow("Mirror store")).queryByText(/Last refresh failed/)).toBeNull());
    expect(db().origins.stores?.find((o) => o.id === "mirror")?.error).toBeUndefined();
  });

  it("say why a refresh failed, in the server's words", async () => {
    server.use(
      http.post(mockUrl("/plugins/{plugin_id}/origins/{origin_id}/refresh"), () =>
        problem(502, "store_fetch_failed", "The store can't be reached", "main: connection refused"),
      ),
    );
    await renderApp("/admin/plugins/stores?tab=extensions");
    const main = await waitFor(() => storeRow("Main store"));
    await userEvent.click(within(main).getByRole("button", { name: "Refresh Main store now" }));
    expect(await within(main).findByRole("alert")).toHaveTextContent("main: connection refused");
  });
});

describe("an installed extension", () => {
  it("shows what was installed, and reloads", async () => {
    const pkg = db().packages.stores?.find((p) => p.id === "org.example.polyglot");
    if (!pkg) throw new Error("no polyglot");
    pkg.error = "Failed to load: class not found";
    await renderApp("/admin/plugins/stores?tab=extensions&pkg=org.example.polyglot");
    const sheet = await screen.findByRole("dialog");
    const installed = within(sheet).getByRole("region", { name: "Installed" });
    expect(within(installed).getByText("Main store")).toBeInTheDocument();
    expect(within(installed).getByText("1.5")).toBeInTheDocument();
    expect(within(sheet).getByText("Failed to load: class not found")).toBeInTheDocument();

    await userEvent.click(within(installed).getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("Polyglot Comics reloaded.")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).queryByText("Failed to load: class not found")).toBeNull());
  });

  it("can't be reloaded before it's installed", async () => {
    await renderApp("/admin/plugins/stores?tab=extensions&pkg=org.example.lantern");
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("region", { name: "Installed" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  });
});

describe("a plugin's sources and their health checks", () => {
  it("show each one's health, filtered from the URL", async () => {
    await renderApp("/admin/plugins/stores?tab=sources&health=failing");
    const ja = await waitFor(() => sourceRow("ja"));
    expect(within(ja).getByText("Failing")).toBeInTheDocument();
    expect(within(ja).getByText("The site answered 503 (SOURCE_DOWN)")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 sources · 1 failing · 1 with scheduled checks off/)).toBeInTheDocument();
  });

  it("check one now through the plugin's health job, and show the outcome", async () => {
    await renderApp("/admin/plugins/stores?tab=sources");
    const ja = await waitFor(() => sourceRow("ja"));
    await userEvent.click(await within(ja).findByRole("button", { name: "Check Polyglot Comics (ja) now" }));
    expect(await within(sourceRow("ja")).findByText("Checking…")).toBeInTheDocument();
    expect(db().pluginJobs.stores?.runs[0]?.params).toEqual({ source_ids: "stores:3002" });

    act(() => {
      for (let i = 0; i < 5; i++) tickJobs(db());
    });
    expect(await screen.findByText("Checked Polyglot Comics (ja).")).toBeInTheDocument();
    expect(await within(sourceRow("ja")).findByText("Healthy")).toBeInTheDocument();
  });

  it("turn a source's scheduled checks on and off", async () => {
    await renderApp("/admin/plugins/stores?tab=sources");
    const es = await waitFor(() => sourceRow("es"));
    const toggle = within(es).getByRole("switch", { name: "Scheduled checks for Polyglot Comics (es)" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(db().sources.find((s) => s.id === "stores:3003")?.health.checks_disabled).toBeUndefined(),
    );
    expect(toggle).toBeChecked();
    // A source that isn't present can't be checked now.
    expect(within(es).queryByRole("button", { name: /Check .* now/ })).not.toBeInTheDocument();
  });

  it("aren't offered by a plugin without health checks", async () => {
    await renderApp("/admin/plugins/example");
    expect(await screen.findByRole("tab", { name: "Network" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sources" })).not.toBeInTheDocument();
  });
});
