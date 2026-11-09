// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/db";
import { mockUrl, problem } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const card = (title: string) =>
  screen.getByText(title, { selector: "[data-slot=card-title]" }).closest("[data-slot=card]") as HTMLElement;
const pluginRow = (name: string) =>
  within(screen.getByRole("list", { name: "Source plugins" }))
    .getByRole("link", { name })
    .closest("li") as HTMLElement;

describe("Admin → Health", () => {
  it("shows the server, the metadata service, plugins and source checks when all is well", async () => {
    for (const source of db().sources) source.health = { status: "ok" };
    await renderApp("/admin/health");
    expect(await screen.findByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(await screen.findByText("Panelarr server dev")).toBeInTheDocument();
    const components = within(screen.getByRole("list", { name: "Server components" }));
    expect(components.getByText("database")).toBeInTheDocument();
    expect(components.getByText("meta")).toBeInTheDocument();
    // The metadata service's own components. Its card is swapped for the service's own once the
    // health answers, so it's looked up anew each time.
    await waitFor(() => expect(within(card("Metadata service")).getByText("Search")).toBeInTheDocument());
    expect(within(card("Metadata service")).getByText(/Metadata service 0\.9\.0/)).toBeInTheDocument();
    // Both plugins, healthy.
    await waitFor(() => pluginRow("Example Store Plugin"));
    expect(within(pluginRow("Example Source Plugin")).getByText("Healthy")).toBeInTheDocument();
    expect(within(pluginRow("Example Store Plugin")).getByText("Healthy")).toBeInTheDocument();
    // Only the plugin with health checks has a line, with nothing failing.
    const checks = await screen.findByRole("list", { name: "Source checks" });
    expect(within(checks).getByText("Example Store Plugin")).toBeInTheDocument();
    expect(within(checks).queryByText("Example Source Plugin")).not.toBeInTheDocument();
    expect(within(checks).getByText("None failing")).toBeInTheDocument();
  });

  it("is where the old System page goes", async () => {
    const { router } = await renderApp("/admin/system");
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/health"));
    expect(await screen.findByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Health" })).toHaveAttribute("href", "/admin/health");
  });

  it("says the metadata service is down in one line, and the rest still shows", async () => {
    server.use(
      http.get(mockUrl("/system/meta/health"), () =>
        problem(503, "meta_unavailable", "Metadata service unavailable", "Can't reach the metadata service."),
      ),
    );
    await renderApp("/admin/health");
    const meta = await waitFor(() => card("Metadata service"));
    expect(await within(meta).findByText("Can't reach the metadata service.")).toBeInTheDocument();
    expect(within(meta).getByText("Down")).toBeInTheDocument();
    expect(within(meta).getByRole("link", { name: "Its connection and settings" })).toHaveAttribute(
      "href",
      "/admin/metadata",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Server components" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Source plugins" })).toBeInTheDocument();
  });

  it("says when the metadata service isn't connected yet", async () => {
    db().meta.check = { ...db().meta.check, configured: false, ready: false };
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname.endsWith("/system/meta/health")) asked.push(request.url);
    });
    await renderApp("/admin/health");
    const meta = await waitFor(() => card("Metadata service"));
    expect(await within(meta).findByText("Not connected yet.")).toBeInTheDocument();
    expect(within(meta).getByRole("link", { name: "Connect it" })).toHaveAttribute("href", "/admin/metadata");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // There's no service to ask, so it isn't asked.
    expect(asked).toEqual([]);
  });

  it("says plugins are optional when there are none, with no source checks", async () => {
    db().plugins = [];
    await renderApp("/admin/health");
    expect(await screen.findByText(/Plugins are optional/)).toBeInTheDocument();
    expect(within(card("Source plugins")).getByRole("link", { name: "Plugins" })).toHaveAttribute(
      "href",
      "/admin/plugins",
    );
    expect(screen.queryByText("Source checks")).not.toBeInTheDocument();
  });

  it("tells a plugin that's off from one that's down", async () => {
    const [example, stores] = db().plugins;
    if (!example || !stores) throw new Error("no plugins");
    example.enabled = false;
    stores.health = "down";
    stores.health_message = "Connection refused";
    await renderApp("/admin/health");
    const off = await waitFor(() => pluginRow("Example Source Plugin"));
    expect(within(off).getByText("Off")).toBeInTheDocument();
    expect(within(off).queryByText("Down")).not.toBeInTheDocument();
    const down = pluginRow("Example Store Plugin");
    expect(within(down).getByText("Down")).toBeInTheDocument();
    expect(within(down).getByText("Connection refused")).toBeInTheDocument();
  });

  it("counts failing sources and checks off, linked to the plugin's Sources tab", async () => {
    // The source with its checks off is hidden (not there now) and so not counted; bring it back.
    const quiet = db().sources.find((s) => s.plugin_id === "stores" && s.health.checks_disabled);
    if (!quiet) throw new Error("no source with checks off");
    quiet.present = true;
    await renderApp("/admin/health");
    const checks = await screen.findByRole("list", { name: "Source checks" });
    const failing = await within(checks).findByRole("link", { name: "1 failing" });
    expect(failing).toHaveAttribute("href", "/admin/plugins/stores?tab=sources&health=failing");
    expect(within(checks).getByRole("link", { name: "1 with checks off" })).toHaveAttribute(
      "href",
      "/admin/plugins/stores?tab=sources&health=off",
    );
  });

  it("keeps each part apart when one fails, and checks again on request", async () => {
    let asked = 0;
    server.use(
      http.get(mockUrl("/plugins"), () => {
        asked++;
        return problem(500, "internal", "Internal error", "The plugins list failed.");
      }),
    );
    await renderApp("/admin/health");
    expect(await within(card("Source plugins")).findByText("The plugins list failed.")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Server components" })).toBeInTheDocument();
    const before = asked;
    await userEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(asked).toBeGreaterThan(before));
  });

  it("spins Check now only for a check someone asked for", async () => {
    let answer: Promise<void> = Promise.resolve();
    let release = () => {};
    const hold = () => {
      answer = new Promise((resolve) => {
        release = resolve;
      });
    };
    server.use(
      http.get(mockUrl("/system/health"), async () => {
        await answer;
        return undefined;
      }),
    );
    const { queryClient } = await renderApp("/admin/health");
    await screen.findByText("Panelarr server dev");
    const button = screen.getByRole("button", { name: "Check now" });
    const spinning = () => button.querySelector("svg")?.classList.contains("animate-spin");
    const key = { queryKey: ["get", "/system/health"] };

    // A poll in the background (what refetchInterval does): the button stays as it is.
    hold();
    void queryClient.refetchQueries(key);
    await waitFor(() => expect(queryClient.isFetching(key)).toBe(1));
    expect(spinning()).toBe(false);
    expect(button).toBeEnabled();
    release();
    await waitFor(() => expect(queryClient.isFetching(key)).toBe(0));

    // Asked for: it spins until every answer is back.
    hold();
    await userEvent.click(button);
    await waitFor(() => expect(spinning()).toBe(true));
    expect(button).toBeDisabled();
    release();
    await waitFor(() => expect(spinning()).toBe(false));
    expect(button).toBeEnabled();
  });

  it("is reached from the admin tabs, for admins only", async () => {
    resetDb("user");
    const { router } = await renderApp("/admin/health");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
