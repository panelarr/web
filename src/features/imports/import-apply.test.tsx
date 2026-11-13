// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "@/api/client";
import { currentUser, db, resetDb } from "@/mocks/db";
import { MAX_IMPORTS, receiveBackup, seedImport, tickImports, WHY_MAY_NOT_ATTACH } from "@/mocks/imports";
import { mockUrl } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { SpecValidator } from "@/test/spec-validator";

// Applying an import, following and cancelling it, its report, and choosing the work of a
// series by hand. The mock's apply goes through 5 of the made-up backup's 42 series per tick.

const adminId = () => db().users.find((u) => u.role === "admin")?.id as string;
const readerId = () => db().users.find((u) => u.role !== "admin")?.id as string;

/** Runs the mock's background work until no import is running. */
function finish() {
  act(() => {
    for (let i = 0; i < 20; i++) tickImports(db());
  });
}

async function applyFromPage() {
  await userEvent.click(await screen.findByRole("button", { name: "Apply import" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(/37 series go into your library/);
  await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
}

const report = () => screen.getByRole("region", { name: "Report" });
const tile = (name: string) => within(report()).getByText(name).nextElementSibling;
const series = () => screen.findByRole("list", { name: "Series" });

describe("applying an import", () => {
  it("applies after asking, follows the progress and reports each series", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}`);
    expect(await screen.findByText(/Apply this import to bring 37 series into your library/)).toBeInTheDocument();
    await applyFromPage();

    expect(await screen.findByText("Importing series: 0 of 42")).toBeInTheDocument();
    expect(screen.getByTestId("import-state")).toHaveTextContent("Importing");
    expect(screen.queryByRole("button", { name: "Apply import" })).not.toBeInTheDocument();
    act(() => void tickImports(db()));
    expect(await screen.findByText("Importing series: 5 of 42")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Importing series" })).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Imported"));
    await waitFor(() => expect(tile("Imported")).toHaveTextContent("37"));
    expect(tile("Already imported")).toHaveTextContent("0");
    expect(tile("Skipped")).toHaveTextContent("0");
    expect(screen.getByText("2 last-read times in the future")).toBeInTheDocument();

    // Each series says what happened to its chapters, and what apply kept.
    const list = await series();
    await waitFor(() => expect(within(list).getAllByText("Imported").length).toBeGreaterThan(0));
    expect(within(list).getAllByText(/\d+ chapters? placed · 2 waiting for their chapters/).length).toBeGreaterThan(0);
    expect(within(list).getAllByText(/1 couldn't be placed/).length).toBeGreaterThan(0);
    expect(within(list).getByText(/kept the series already attached on this source/)).toBeInTheDocument();

    // They are in the library, with the backup's added date for new entries.
    const user = currentUser();
    expect(db().library.filter((e) => e.user_id === user?.id).length).toBeGreaterThan(0);
    expect(db().library.some((e) => e.added_at.startsWith("2025-"))).toBe(true);
  });

  it("says already imported when the same backup is applied again", async () => {
    const first = seedImport(db(), adminId());
    const { router } = await renderApp(`/settings/imports/${first.id}`);
    await applyFromPage();
    await screen.findByText(/Importing series/);
    finish();
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Imported"));

    const again = seedImport(db(), adminId(), "2026-11-02T10:00:00Z");
    await act(() => router.navigate({ to: "/settings/imports/$importId", params: { importId: again.id } }));
    await applyFromPage();
    await screen.findByText(/Importing series/);
    finish();
    await waitFor(() => expect(tile("Already imported")).toHaveTextContent("37"));
    expect(tile("Imported")).toHaveTextContent("0");
    const list = await series();
    await waitFor(() => expect(within(list).getAllByText("Already imported")).toHaveLength(25));
  });

  it("cancels while it applies, keeps what it applied and resumes", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}`);
    await applyFromPage();
    await screen.findByText("Importing series: 0 of 42");
    act(() => void tickImports(db()));
    await screen.findByText("Importing series: 5 of 42");

    await userEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Cancelled"));
    expect(await screen.findByText("Import cancelled: what it applied stays.")).toBeInTheDocument();
    // Ticks do nothing to a cancelled import.
    act(() => void tickImports(db()));
    await waitFor(() => expect(tile("Imported")).toHaveTextContent("5"));
    expect(screen.getByText("The import stopped before it was done.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume import" }));
    expect(await screen.findByText("Importing series: 5 of 42")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Imported"));
    await waitFor(() => expect(tile("Imported")).toHaveTextContent("37"));
  });

  it("cancels while it matches, and then can't be applied", async () => {
    const user = currentUser();
    if (!user) throw new Error("no user");
    const response = await receiveBackup(user, new Uint8Array([0x1f, 0x8b, 9, 9]));
    const created = (await response.json()) as { id: string };
    await renderApp(`/settings/imports/${created.id}`);
    await screen.findByText("Matching series: 0 of 42");
    await userEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Cancelled"));
    expect(await screen.findByText("Matching cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resume import|Apply import/ })).not.toBeInTheDocument();
  });

  it("points to the running import when another one runs", async () => {
    const running = seedImport(db(), adminId(), "2026-11-02T10:00:00Z");
    const created = seedImport(db(), adminId());
    const other = db().imports.find((i) => i.import.id === running.id);
    if (other) other.import.state = "previewing";
    await renderApp(`/settings/imports/${created.id}`);
    await applyFromPage();
    expect(await screen.findByText("Another import is running")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "Open the running import" });
    expect(link).toHaveAttribute("href", `/settings/imports/${running.id}`);
  });

  it("says why when the server won't apply it", async () => {
    const created = seedImport(db(), adminId());
    server.use(
      http.post(mockUrl("/me/imports/{id}/apply"), () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, code: "import_state", detail: "only a preview" },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await renderApp(`/settings/imports/${created.id}`);
    await applyFromPage();
    expect(await screen.findByText("This import can't be applied")).toBeInTheDocument();
    expect(screen.getByText("only a preview")).toBeInTheDocument();
  });

  it("shows when a series' source wasn't attached for lack of permission", async () => {
    resetDb("user");
    const reader = db().users.find((u) => u.id === readerId());
    if (!reader) throw new Error("no reader");
    reader.grants = { ...reader.grants, may_add: false, may_manage_matches: false };
    const created = seedImport(db(), reader.id);
    await renderApp(`/settings/imports/${created.id}?outcome=in_library`);
    await applyFromPage();
    await screen.findByText(/Importing series/);
    finish();
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Imported"));
    const list = await series();
    await waitFor(() => expect(within(list).getAllByText(WHY_MAY_NOT_ATTACH)).toHaveLength(3));
  });
});

describe("choosing the work of a series", () => {
  it("picks a candidate before apply: the series moves to Ready", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}?outcome=needs_choice`);
    const list = await series();
    const row = within(list).getAllByRole("listitem")[0] as HTMLElement;
    const title = row.querySelector("p")?.textContent ?? "";
    await userEvent.click(within(row).getByRole("button", { name: /Choose the work for/ }));
    const dialog = await screen.findByRole("dialog", { name: "Choose the work" });
    const matches = within(dialog).getByRole("region", { name: "Possible matches" });
    expect(within(matches).getByText("Paper Kites Over Harbor Town")).toBeInTheDocument();
    expect(within(matches).getByText(/82% alike/)).toBeInTheDocument();
    await userEvent.click(within(matches).getByRole("button", { name: "Choose Paper Kites Over Harbor Town" }));

    expect(await screen.findByText(`Chosen: ${title} is imported with the rest.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Needs a choice/ })).toHaveTextContent("1"));
    expect(screen.getByRole("tab", { name: /Ready/ })).toHaveTextContent("31");
    const item = db().imports[0]?.items.find((i) => i.title === title);
    expect(item?.entry_id).toBe("ent_1003");
    expect(item?.outcome).toBe("ready");
  });

  it("searches the catalogue after apply and imports the series at once", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}?outcome=not_found`);
    await applyFromPage();
    await screen.findByText(/Importing series/);
    finish();
    await waitFor(() => expect(screen.getByTestId("import-state")).toHaveTextContent("Imported"));

    const list = await series();
    const row = within(list).getAllByRole("listitem")[0] as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /Choose the work for/ }));
    const dialog = await screen.findByRole("dialog", { name: "Choose the work" });
    expect(within(dialog).queryByRole("region", { name: "Possible matches" })).not.toBeInTheDocument();
    const field = within(dialog).getByRole("searchbox", { name: "Search the catalogue" });
    await userEvent.clear(field);
    await userEvent.type(field, "Glass");
    const results = await within(dialog).findByRole("list", { name: "Catalogue results" });
    await userEvent.click(within(results).getByRole("button", { name: "Choose Glass Sea" }));

    expect(await screen.findByText(/^Imported /)).toBeInTheDocument();
    await waitFor(() => expect(tile("Imported")).toHaveTextContent("38"));
    expect(screen.getByRole("tab", { name: /Not found/ })).toHaveTextContent("1");
    expect(db().library.some((e) => db().works.find((w) => w.id === e.work_id)?.entry_id === "ent_1013")).toBe(true);
  });

  it("skips a series, and a skipped one can still be chosen", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}?outcome=not_found`);
    const list = await series();
    const row = within(list).getAllByRole("listitem")[0] as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /Choose the work for/ }));
    const dialog = await screen.findByRole("dialog", { name: "Choose the work" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Skip this series" }));
    await waitFor(() => expect(within(list).getByText("Skipped")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Report" })).toBeInTheDocument();
    expect(tile("Skipped")).toHaveTextContent("1");

    // Skipped: no Skip again, but still Choose.
    const skipped = within(list).getByText("Skipped").closest("li") as HTMLElement;
    await userEvent.click(within(skipped).getByRole("button", { name: /Choose the work for/ }));
    const again = await screen.findByRole("dialog", { name: "Choose the work" });
    expect(within(again).queryByRole("button", { name: "Skip this series" })).not.toBeInTheDocument();
  });

  it("says why a choice isn't allowed", async () => {
    const created = seedImport(db(), adminId());
    server.use(
      http.post(mockUrl("/me/imports/{id}/items/{idx}/resolve"), () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not allowed",
            status: 422,
            code: "not_allowed",
            detail: "the work is above your content rating limit",
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await renderApp(`/settings/imports/${created.id}?outcome=needs_choice`);
    const list = await series();
    const row = within(list).getAllByRole("listitem")[0] as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /Choose the work for/ }));
    const dialog = await screen.findByRole("dialog", { name: "Choose the work" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose Glass Sea" }));
    expect(await within(dialog).findByText("You can't import that work")).toBeInTheDocument();
    expect(within(dialog).getByText("the work is above your content rating limit")).toBeInTheDocument();
  });

  it("offers no Choose while the import runs", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}?outcome=needs_choice`);
    await within(await series()).findAllByRole("button", { name: /Choose the work for/ });
    await applyFromPage();
    await screen.findByText(/Importing series/);
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /Choose the work for/ })).toHaveLength(0));
  });
});

describe("uploading with too many imports", () => {
  it("tells the user to delete an old one", async () => {
    for (let i = 0; i < MAX_IMPORTS; i++)
      seedImport(db(), adminId(), `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`);
    const user = currentUser();
    if (!user) throw new Error("no user");
    const answer = await receiveBackup(user, new Uint8Array([0x1f, 0x8b, 1, 2, 3]));
    expect(answer.status).toBe(409);
    server.use(http.post(mockUrl("/me/imports"), () => answer.clone()));
    await renderApp("/settings?tab=import");
    await userEvent.upload(
      await screen.findByLabelText("Backup file"),
      new File([new Uint8Array([0x1f, 0x8b])], "b.tachibk"),
    );
    expect(await screen.findByText("You have too many imports")).toBeInTheDocument();
    expect(screen.getByText("you keep 20 imports already: delete one first")).toBeInTheDocument();
    expect(screen.getByText(/Delete an old import under Your imports/)).toBeInTheDocument();
  });
});

describe("the mock's apply", () => {
  let validator: SpecValidator;
  beforeAll(async () => {
    validator = await SpecValidator.load();
  });

  it("answers what the spec says", async () => {
    const created = seedImport(db(), adminId());
    const found = db().imports.find((i) => i.import.id === created.id);
    if (!found) throw new Error("not seeded");
    found.import.state = "applying";
    finish();
    const items = validator.schema("ImportItem");
    for (const item of found.items) {
      items(item);
      expect(items.errors ?? []).toEqual([]);
    }
    const { data } = await api.GET("/me/imports/{id}", { params: { path: { id: created.id } } });
    const imp = validator.schema("Import");
    imp(data);
    expect(imp.errors ?? []).toEqual([]);
    expect(found.import.summary.clamped_times).toBe(2);
  });
});
