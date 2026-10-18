// SPDX-License-Identifier: GPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { mockUrl, problem } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { delaysText } from "./image-retries";

const POLYGLOT = "/admin/plugins/stores?tab=extensions&pkg=org.example.polyglot";
const PACKAGE = "package:stores:org.example.polyglot";

/** The source settings dialog's section (the extension's sheet is open under it). */
async function sourceSection() {
  await screen.findByLabelText("Image retries for this source");
  return screen.getByLabelText("Image retries for this source").closest("section") as HTMLElement;
}

async function openSheet() {
  await renderApp(POLYGLOT);
  const sheet = await screen.findByRole("dialog");
  const section = within(sheet).getByRole("region", { name: "Image retries" });
  await within(section).findByText(/^In effect:/);
  return { sheet, section };
}

describe("image retries in words", () => {
  it("says how many more attempts, after which waits", () => {
    expect(delaysText([1000, 3000])).toBe("2 more attempts, after 1 s then 3 s");
    expect(delaysText([500])).toBe("1 more attempt, after 0.5 s");
    expect(delaysText([1000, 3000, 10000])).toBe("3 more attempts, after 1 s, 3 s then 10 s");
    expect(delaysText([])).toBe("no more attempts");
  });
});

describe("an extension's image retries", () => {
  it("shows the default, then waits of its own, starting from what's in effect", async () => {
    const { section } = await openSheet();
    const select = within(section).getByLabelText("Image retries for this extension");
    expect(within(section).getByText(/^In effect:/)).toHaveTextContent(
      "In effect: 2 more attempts, after 1 s then 3 s (the default).",
    );
    expect(within(select).getByRole("option", { name: "Default: 2 more attempts, after 1 s then 3 s" })).toBeTruthy();

    await userEvent.selectOptions(select, "custom");
    const waits = within(section).getAllByRole("spinbutton");
    expect(waits.map((w) => (w as HTMLInputElement).value)).toEqual(["1", "3"]);
    await userEvent.click(within(section).getByRole("button", { name: "Add attempt" }));
    const third = within(section).getByRole("spinbutton", { name: "Wait before attempt 4, in seconds" });
    await userEvent.clear(third);
    await userEvent.type(third, "10");
    await userEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db().imageRetries[PACKAGE]?.delays_ms).toEqual([1000, 3000, 10000]));
    expect(await within(section).findByText(/\(set here\)/)).toHaveTextContent(
      "In effect: 3 more attempts, after 1 s, 3 s then 10 s (set here).",
    );

    // Off is a setting of its own, not the default.
    await userEvent.selectOptions(within(section).getByLabelText("Image retries for this extension"), "off");
    await waitFor(() => expect(db().imageRetries[PACKAGE]?.delays_ms).toEqual([]));
    expect(await within(section).findByText(/no more attempts \(set here\)/)).toBeInTheDocument();

    // Back to the default: nothing set here.
    await userEvent.selectOptions(within(section).getByLabelText("Image retries for this extension"), "inherit");
    await waitFor(() => expect(db().imageRetries[PACKAGE]).toBeUndefined());
    expect(await within(section).findByText(/\(the default\)/)).toBeInTheDocument();
  });

  it("keeps waits within what the server takes, and shows its refusal", async () => {
    const { section } = await openSheet();
    await userEvent.selectOptions(within(section).getByLabelText("Image retries for this extension"), "custom");
    const first = within(section).getByRole("spinbutton", { name: "Wait before attempt 2, in seconds" });
    await userEvent.clear(first);
    await userEvent.type(first, "45");
    expect(within(section).getByRole("alert")).toHaveTextContent("Each wait is 0 to 30 s.");
    expect(within(section).getByRole("button", { name: "Save" })).toBeDisabled();
    for (let i = 0; i < 3; i++) await userEvent.click(within(section).getByRole("button", { name: "Add attempt" }));
    expect(within(section).getByRole("button", { name: "Add attempt" })).toBeDisabled();

    server.use(
      http.put(mockUrl("/plugins/{plugin_id}/packages/{package_id}/image-retries"), () =>
        problem(400, "invalid_request", "Invalid delays", "At most 5 waits, each 0 to 30000 ms."),
      ),
    );
    await userEvent.clear(first);
    await userEvent.type(first, "2");
    await userEvent.click(within(section).getByRole("button", { name: "Save" }));
    expect(await within(section).findByText("At most 5 waits, each 0 to 30000 ms.")).toBeInTheDocument();
    expect(db().imageRetries[PACKAGE]).toBeUndefined();
  });
});

describe("a source's image retries", () => {
  it("inherit its extension's, can be its own or off, and go back to inheriting", async () => {
    db().imageRetries[PACKAGE] = { delays_ms: [2000], updated_at: "2026-10-18T12:00:00Z" };
    const { sheet } = await openSheet();
    const [settings] = within(sheet).getAllByRole("button", { name: "Settings for Polyglot Comics" });
    await userEvent.click(settings as HTMLElement);
    const section = await sourceSection();
    expect(await within(section).findByText(/^In effect:/)).toHaveTextContent(
      "In effect: 1 more attempt, after 2 s (from its extension).",
    );
    const select = () => within(section).getByLabelText("Image retries for this source");
    expect(within(select()).getByRole("option", { name: "As its extension: 1 more attempt, after 2 s" })).toBeTruthy();

    await userEvent.selectOptions(select(), "off");
    await waitFor(() => expect(db().imageRetries["source:stores:3001"]?.delays_ms).toEqual([]));
    expect(await within(section).findByText(/no more attempts \(set here\)/)).toBeInTheDocument();
    // What inheriting would give is still said.
    expect(
      await within(select()).findByRole("option", { name: "As its extension: 1 more attempt, after 2 s" }),
    ).toBeTruthy();

    await userEvent.selectOptions(select(), "inherit");
    await waitFor(() => expect(db().imageRetries["source:stores:3001"]).toBeUndefined());
    expect(await within(section).findByText(/\(from its extension\)/)).toBeInTheDocument();
  });

  it("follows a change to its extension", async () => {
    const { sheet, section: extension } = await openSheet();
    // Seen once (and cached) before the extension changes.
    const [settings] = within(sheet).getAllByRole("button", { name: "Settings for Polyglot Comics" });
    await userEvent.click(settings as HTMLElement);
    expect(await within(await sourceSection()).findByText(/\(the default\)/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText("Image retries for this source")).toBeNull());

    await userEvent.selectOptions(within(extension).getByLabelText("Image retries for this extension"), "off");
    await waitFor(() => expect(db().imageRetries[PACKAGE]?.delays_ms).toEqual([]));
    await userEvent.click(settings as HTMLElement);
    const section = await sourceSection();
    expect(await within(section).findByText(/^In effect:/)).toHaveTextContent(
      "In effect: no more attempts (from its extension).",
    );
  });
});
