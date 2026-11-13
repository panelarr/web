// SPDX-License-Identifier: GPL-3.0-or-later

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { currentUser, db, resetDb } from "@/mocks/db";
import { backupItems, receiveBackup, seedImport, tickImports } from "@/mocks/imports";
import { mockUrl } from "@/mocks/op";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { SpecValidator } from "@/test/spec-validator";

/** The bytes of each file a test makes, by file. */
const contents = new WeakMap<Blob, Uint8Array>();

function file(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  const made = new File([bytes], name);
  contents.set(made, bytes);
  return made;
}

/** A file that starts like gzip, as every backup does; `seed` makes its bytes (and hash) differ. */
function backupFile(seed = 0, name = "library.tachibk"): File {
  return file(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, seed, 1, 2, 3]), name);
}

/**
 * jsdom's files lose their bytes on the way through Node's fetch, so the mock server gets
 * them from the test: the request is checked for the multipart field, and the file the app
 * appended is the one handed over.
 */
let lastFile: File | undefined;
beforeEach(() => {
  lastFile = undefined;
  const append = FormData.prototype.append;
  vi.spyOn(FormData.prototype, "append").mockImplementation(function (this: FormData, ...args: unknown[]) {
    if (args[0] === "file" && args[1] instanceof File) lastFile = args[1];
    Reflect.apply(append, this, args);
  });
  server.use(
    http.post(mockUrl("/me/imports"), async ({ request }) => {
      expect(request.headers.get("Content-Type")).toMatch(/^multipart\/form-data; boundary=/);
      expect(await request.text()).toContain('name="file"');
      const user = currentUser();
      if (!user || !lastFile) throw new Error("no user or no file");
      return receiveBackup(user, contents.get(lastFile) ?? new Uint8Array());
    }),
  );
});

async function upload(picked: File) {
  await userEvent.upload(await screen.findByLabelText("Backup file"), picked);
}

const adminId = () => db().users.find((u) => u.role === "admin")?.id as string;
const readerId = () => db().users.find((u) => u.role !== "admin")?.id as string;

describe("the mock backup", () => {
  let validator: SpecValidator;
  beforeAll(async () => {
    validator = await SpecValidator.load();
  });

  it("matches the spec", () => {
    const validate = validator.schema("ImportItem");
    for (const item of backupItems()) {
      validate(item);
      expect(validate.errors ?? []).toEqual([]);
    }
  });
});

describe("Settings → Import", () => {
  it("explains how to make a backup and lists no imports yet", async () => {
    await renderApp("/settings?tab=import");
    expect(await screen.findByText("Import from Suwayomi or Mihon")).toBeInTheDocument();
    expect(screen.getByText(/Only series in that app's library are in the backup/)).toBeInTheDocument();
    expect(await screen.findByText("No imports yet")).toBeInTheDocument();
  });

  it("uploads a backup, follows the matching and shows the preview", async () => {
    const { router } = await renderApp("/settings?tab=import");
    await upload(backupFile());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/settings\/imports\/[0-9a-f-]+$/));
    expect(await screen.findByText("Matching series: 0 of 42")).toBeInTheDocument();
    expect(screen.getByTestId("import-state")).toHaveTextContent("Matching series");
    // The totals are known from the file at once.
    const totals = screen.getByRole("region", { name: "Totals" });
    expect(within(totals).getByText("Series").nextElementSibling).toHaveTextContent("42");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    // Progress comes from events.
    act(() => void tickImports(db()));
    expect(await screen.findByText("Matching series: 12 of 42")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Matching series" })).toBeInTheDocument();

    // The end refetches the import: tabs with their counts and the package hint.
    act(() => {
      for (let i = 0; i < 4; i++) tickImports(db());
    });
    const tabs = await screen.findByRole("tablist");
    expect(screen.getByTestId("import-state")).toHaveTextContent("Ready to review");
    const names = within(tabs)
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(names).toEqual([
      "Ready30",
      "Already in library3",
      "Needs a choice2",
      "Not found2",
      "Source missing4",
      "Not allowed1",
    ]);
    expect(screen.getByText(/Installing Lantern Reader would attach 4 series/)).toBeInTheDocument();
  });

  it("says when a file isn't a backup", async () => {
    await renderApp("/settings?tab=import");
    await upload(file(new TextEncoder().encode("just text"), "notes.txt"));
    expect(await screen.findByText("That file isn't a backup Panelarr can read")).toBeInTheDocument();
    expect(db().imports).toHaveLength(0);
  });

  it("refuses a file over 64 MiB before sending it", async () => {
    let sent = false;
    server.use(
      http.post(mockUrl("/me/imports"), () => {
        sent = true;
        return HttpResponse.json({});
      }),
    );
    await renderApp("/settings?tab=import");
    const big = backupFile();
    Object.defineProperty(big, "size", { value: 65 * 1024 * 1024 });
    await upload(big);
    expect(await screen.findByText("The file is too large")).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it("shows the server's 413", async () => {
    server.use(
      http.post(mockUrl("/me/imports"), () =>
        HttpResponse.json(
          { type: "about:blank", title: "Too large", status: 413, code: "too_large" },
          { status: 413, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await renderApp("/settings?tab=import");
    await upload(backupFile());
    expect(await screen.findByText("A backup can be at most 64 MiB.")).toBeInTheDocument();
  });

  it("counts down when the server is busy, then lets you try again", async () => {
    let calls = 0;
    server.use(
      http.post(
        mockUrl("/me/imports"),
        () => {
          calls++;
          return HttpResponse.json(
            { type: "about:blank", title: "Busy", status: 429, code: "busy", detail: "Reading another backup." },
            { status: 429, headers: { "Content-Type": "application/problem+json", "Retry-After": "1" } },
          );
        },
        { once: true },
      ),
    );
    const { router } = await renderApp("/settings?tab=import");
    await upload(backupFile());
    expect(await screen.findByText("The server is busy")).toBeInTheDocument();
    expect(screen.getByText("It is reading another backup. Try again in 1 s.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toBeDisabled();
    await waitFor(() => expect(retry).toBeEnabled(), { timeout: 3_000 });
    await userEvent.click(retry);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/settings\/imports\//));
    expect(calls).toBe(1);
    expect(db().imports).toHaveLength(1);
  });

  it("points to the running import on a 409", async () => {
    await renderApp("/settings?tab=import");
    await upload(backupFile(1));
    await screen.findByText(/Matching series: 0 of/);
    await userEvent.click(screen.getByRole("link", { name: "Imports" }));
    await upload(backupFile(2));
    expect(await screen.findByText("You already have an import running")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "Open the running import" });
    expect(link).toHaveAttribute("href", `/settings/imports/${db().imports[0]?.import.id}`);
  });

  it("opens the earlier import for a file uploaded before", async () => {
    const { router } = await renderApp("/settings?tab=import");
    await upload(backupFile(3));
    await screen.findByText("Matching series: 0 of 42");
    act(() => {
      for (let i = 0; i < 4; i++) tickImports(db());
    });
    const first = router.state.location.pathname;
    await userEvent.click(await screen.findByRole("link", { name: "Imports" }));
    // The list shows it.
    const list = await screen.findByRole("list", { name: "Your imports" });
    expect(within(list).getByText("Ready to review")).toBeInTheDocument();
    await upload(backupFile(3));
    expect(await screen.findByText("You imported this file before: here is that import.")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(first));
    expect(db().imports).toHaveLength(1);
  });
});

describe("an import's preview", () => {
  it("pages through a tab's series", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}`);
    const series = await screen.findByRole("list", { name: "Series" });
    expect(within(series).getAllByRole("listitem")).toHaveLength(25);
    expect(within(series).getByText("Harbor Lights")).toBeInTheDocument();
    expect(within(series).getAllByText(/Example Source · \d+ chapters? read/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "More series" }));
    await waitFor(() => expect(within(series).getAllByRole("listitem")).toHaveLength(30));
    expect(screen.queryByRole("button", { name: "More series" })).not.toBeInTheDocument();
  });

  it("switches tabs in the URL and shows why a series isn't allowed", async () => {
    const created = seedImport(db(), adminId());
    const { router } = await renderApp(`/settings/imports/${created.id}`);
    await userEvent.click(await screen.findByRole("tab", { name: /Not allowed/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ outcome: "not_allowed" }));
    expect(await screen.findByText("This work is above your content rating limit.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Needs a choice/ }));
    expect(await screen.findAllByText(/2 possible matches/)).toHaveLength(2);
    await userEvent.click(screen.getByRole("tab", { name: /Source missing/ }));
    expect(await screen.findAllByText(/Lantern Reader · /)).not.toHaveLength(0);
  });

  it("links admins to the package in Extensions", async () => {
    const created = seedImport(db(), adminId());
    await renderApp(`/settings/imports/${created.id}`);
    const link = await screen.findByRole("link", { name: "Open Lantern Reader in Extensions" });
    expect(link).toHaveAttribute("href", "/admin/plugins/stores?tab=extensions&pkg=org.example.lantern");
    expect(screen.getByText("Categories aren't imported yet: 3 categories")).toBeInTheDocument();
    expect(screen.getByText(/Also in the backup, not imported: 5 tracker links/)).toBeInTheDocument();
  });

  it("tells other users to ask an admin", async () => {
    resetDb("user");
    const created = seedImport(db(), readerId());
    await renderApp(`/settings/imports/${created.id}`);
    expect(await screen.findByText(/Ask an admin to install it/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /in Extensions/ })).not.toBeInTheDocument();
  });

  it("doesn't show another user's import", async () => {
    const created = seedImport(db(), readerId());
    await renderApp(`/settings/imports/${created.id}`);
    expect(await screen.findByText("No such import.")).toBeInTheDocument();
  });

  it("deletes the import after asking", async () => {
    const created = seedImport(db(), adminId());
    const { router } = await renderApp(`/settings/imports/${created.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Nothing in your library changes/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(router.state.location.search).toEqual({ tab: "import" });
    expect(db().imports).toHaveLength(0);
    expect(await screen.findByText("No imports yet")).toBeInTheDocument();
  });
});
