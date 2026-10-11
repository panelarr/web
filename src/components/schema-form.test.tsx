// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { pluginConfig } from "@/mocks/data";
import { initialValues, type JsonSchema, SchemaForm } from "./schema-form";

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
      proxy: { url: "http://proxy:8888", enabled: false },
    });
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
