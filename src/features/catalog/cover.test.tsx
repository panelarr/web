// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Cover } from "./cover";

describe("a cover", () => {
  it("starts over when it is given another series' image", () => {
    const { rerender } = render(<Cover url="/covers/a.jpg" title="Series A" />);
    const first = screen.getByRole("img", { name: "Cover of Series A" });
    fireEvent.load(first);
    expect(first).toHaveClass("opacity-100");

    // The same row now shows another series (a list re-rendered in place). Until its own cover
    // has loaded, nothing may be shown: a browser keeps painting the old image while a changed
    // src loads, which put one series' cover next to another's title.
    rerender(<Cover url="/covers/b.jpg" title="Series B" />);
    const second = screen.getByRole("img", { name: "Cover of Series B" });
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute("src", expect.stringContaining("/covers/b.jpg"));
    expect(second).toHaveClass("opacity-0");
    fireEvent.load(second);
    expect(second).toHaveClass("opacity-100");
  });

  it("tries a new image after the previous one failed", () => {
    const { rerender } = render(<Cover url="/covers/broken.jpg" title="Series A" />);
    fireEvent.error(screen.getByRole("img", { name: "Cover of Series A" }));
    expect(screen.getByLabelText("No cover for Series A")).toBeInTheDocument();

    rerender(<Cover url="/covers/b.jpg" title="Series B" />);
    expect(screen.getByRole("img", { name: "Cover of Series B" })).toHaveAttribute(
      "src",
      expect.stringContaining("/covers/b.jpg"),
    );
  });
});
