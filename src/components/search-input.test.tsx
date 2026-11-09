// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./search-input";

function Harness({ initial = "", onClear }: { initial?: string; onClear?: () => void }) {
  const [value, setValue] = useState(initial);
  return <SearchInput aria-label="Search things" value={value} onChange={setValue} onClear={onClear} />;
}

describe("SearchInput", () => {
  it("shows the clear button only with a value", async () => {
    render(<Harness />);
    const field = screen.getByRole("searchbox", { name: "Search things" });
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    await userEvent.type(field, "moon");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("clears and refocuses on ✕", async () => {
    const onClear = vi.fn();
    render(<Harness initial="moon" onClear={onClear} />);
    const field = screen.getByRole("searchbox", { name: "Search things" });
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("clears on Escape", async () => {
    const onClear = vi.fn();
    render(<Harness initial="moon" onClear={onClear} />);
    const field = screen.getByRole("searchbox", { name: "Search things" });
    await userEvent.type(field, "{Escape}");
    expect(field).toHaveValue("");
    expect(onClear).toHaveBeenCalledOnce();
    // Escape on an empty field is left alone.
    await userEvent.type(field, "{Escape}");
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("hides the browser's own clear button", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox").className).toContain("[&::-webkit-search-cancel-button]:appearance-none");
  });

  it("has no ✕ or Escape when not clearable", async () => {
    const onChange = vi.fn();
    render(<SearchInput aria-label="Search" value="moon" onChange={onChange} clearable={false} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "{Escape}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
