// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { pluginConfig } from "@/mocks/data";
import { initialValues, type JsonSchema, orderedProperties, SchemaForm } from "./schema-form";

const schema = pluginConfig.schema as JsonSchema;

describe("SchemaForm", () => {
  it("renders a control per setting, with saved values", () => {
    render(<SchemaForm schema={schema} values={pluginConfig.values} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Service URL")).toHaveValue("http://backend:8080");
    expect(screen.getByLabelText("API token")).toHaveAttribute("type", "password");
    expect(screen.getByText(/leave empty to keep the saved value/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "en" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ja" })).not.toBeChecked();
    expect(screen.getByLabelText("Image quality")).toHaveValue("original");
    expect(screen.getByLabelText("Results per page")).toHaveValue(20);
    expect(screen.getByRole("switch", { name: "Show adult sources" })).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Proxy" })).toBeInTheDocument();
  });

  it("submits typed values", async () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} values={pluginConfig.values} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "ja" }));
    await userEvent.clear(screen.getByLabelText("Results per page"));
    await userEvent.type(screen.getByLabelText("Results per page"), "50");
    await userEvent.click(screen.getByRole("switch", { name: "Show adult sources" }));
    await userEvent.type(screen.getByLabelText("Proxy URL"), "http://proxy:8888");
    await userEvent.selectOptions(screen.getByLabelText("Image quality"), "compressed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith({
      base_url: "http://backend:8080",
      api_token: "",
      languages: ["en", "ja"],
      mode: "compressed",
      max_results: 50,
      show_nsfw: true,
      stores: [{ url: "https://store.example.com/index.json" }],
      packages: [],
      proxy: { url: "http://proxy:8888", enabled: false },
    });
  });

  it("edits a list of objects: add, fill in, remove", async () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} values={pluginConfig.values} onSubmit={onSubmit} />);
    const stores = screen.getByRole("group", { name: "Extension stores" });
    expect(within(stores).getByLabelText("Store URL")).toHaveValue("https://store.example.com/index.json");

    await userEvent.click(within(stores).getByRole("button", { name: "Add store" }));
    const urls = within(stores).getAllByLabelText("Store URL");
    expect(urls).toHaveLength(2);
    await userEvent.type(urls[1] as HTMLElement, "https://other.example.org/index.json");
    await userEvent.type(within(stores).getAllByLabelText("Signing key fingerprint")[1] as HTMLElement, "ab:cd");
    await userEvent.click(within(stores).getByRole("button", { name: "Remove store 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ stores: [{ url: "https://other.example.org/index.json", fingerprint: "ab:cd" }] }),
    );
  });

  it("takes a list of text one item per line, and Enter starts the next", async () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} values={pluginConfig.values} onSubmit={onSubmit} />);
    const packages = screen.getByLabelText("Extensions");
    expect(packages).toHaveAccessibleDescription(/One per line/);
    await userEvent.type(packages, "org.example.one{Enter}org.example.two{Enter}");
    expect(packages).toHaveValue("org.example.one\norg.example.two\n");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ packages: ["org.example.one", "org.example.two"] }),
    );
  });

  it("starts from the schema's defaults when nothing is saved", () => {
    expect(initialValues(schema, undefined)).toMatchObject({
      base_url: "http://backend:8080",
      mode: "original",
      max_results: 20,
      show_nsfw: false,
      proxy: { url: undefined, enabled: undefined },
    });
  });

  it("puts the server's field errors on their fields", () => {
    const error = new ApiError({
      status: 400,
      code: "invalid_config",
      title: "Invalid settings",
      detail: "The plugin rejected the settings.",
      fieldErrors: [{ field: "proxy.url", message: "must be an http(s) URL" }],
    });
    render(<SchemaForm schema={schema} values={pluginConfig.values} onSubmit={() => {}} error={error} />);
    expect(screen.getByText("The plugin rejected the settings.")).toBeInTheDocument();
    expect(screen.getByLabelText("Proxy URL")).toHaveAccessibleDescription(/must be an http\(s\) URL/);
  });
});

describe("orderedProperties", () => {
  const names = (schema: JsonSchema) => orderedProperties(schema).map(([name]) => name);
  const prop = (extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: "string", ...extra });

  it("keeps the order the schema was written in", () => {
    expect(names({ properties: { url: prop(), api_key: prop(), stores: prop() } })).toEqual([
      "url",
      "api_key",
      "stores",
    ]);
  });

  it("puts required fields first when the keys arrive sorted (their order was lost)", () => {
    expect(names({ required: ["url"], properties: { fingerprint: prop(), note: prop(), url: prop() } })).toEqual([
      "url",
      "fingerprint",
      "note",
    ]);
  });

  it("follows x-order or propertyOrder hints, unhinted ones last", () => {
    expect(
      names({
        properties: { a: prop(), b: prop({ "x-order": 2 }), c: prop({ propertyOrder: 1 }), d: prop() },
      }),
    ).toEqual(["c", "b", "a", "d"]);
  });

  it("shows a plugin's settings in a sensible order after its keys were sorted", () => {
    // How a store-list schema arrives once a map has sorted its keys.
    const arrived: JsonSchema = {
      type: "object",
      required: ["service_url"],
      properties: {
        api_key: { type: "string", title: "API key", writeOnly: true },
        packages: { type: "array", title: "Extensions", items: { type: "string" } },
        service_url: { type: "string", title: "Service URL" },
        stores: {
          type: "array",
          title: "Extension stores",
          items: {
            type: "object",
            title: "Store",
            required: ["url"],
            properties: {
              fingerprint: { type: "string", title: "Signing key fingerprint" },
              url: { type: "string", title: "Store URL" },
            },
          },
        },
      },
    };
    render(
      <SchemaForm schema={arrived} values={{ stores: [{ url: "https://store.example.com/" }] }} onSubmit={() => {}} />,
    );
    const labels = [...document.querySelectorAll("label, legend")].map((el) => el.textContent);
    expect(labels).toEqual([
      "Service URL",
      "API key",
      "Extensions",
      "Extension stores",
      "Store URL",
      "Signing key fingerprint",
    ]);
  });
});
