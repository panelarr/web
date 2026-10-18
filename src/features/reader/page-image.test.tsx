// SPDX-License-Identifier: GPL-3.0-or-later

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageImage } from "./page-image";

const page = (props: { hold?: boolean; known?: boolean }) => (
  <PageImage url="/api/v1/x.png" index={12} fit="width" stretch placeholderHeight="577px" {...props} />
);

describe("a page in a long strip", () => {
  it("waits while held, then keeps its image even when held again", () => {
    const { rerender } = render(page({ hold: true }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(page({ hold: false }));
    const image = screen.getByRole("img", { name: "Page 13" });
    fireEvent.load(image);

    // Reading on moves the pages that may load: taking the image away would collapse its space
    // and move everything below it (IN-0068).
    rerender(page({ hold: true }));
    expect(screen.getByRole("img", { name: "Page 13" })).toBe(image);
  });

  it("shows a page seen before at once, without the loading fade or spinner", () => {
    render(page({ known: true }));
    expect(screen.getByRole("img", { name: "Page 13" })).not.toHaveClass("opacity-0");
    expect(screen.queryByLabelText("Loading page 13")).not.toBeInTheDocument();
  });

  it("gets a whole-pixel height from its size, so stacked pages leave no hairline gaps", () => {
    // 402 wide, 800 × 1149 natural: 577.37 px, rounded to 577 (IN-0077).
    render(
      <PageImage url="/x.png" index={12} fit="width" stretch exactWidth={402} size={{ width: 800, height: 1149 }} />,
    );
    const image = screen.getByRole("img", { name: "Page 13" });
    expect(image.style.height).toBe("577px");
    expect(image.parentElement?.style.height).toBe("577px");
  });

  it("fades a new page in once it has loaded", () => {
    render(page({}));
    const image = screen.getByRole("img", { name: "Page 13" });
    expect(image).toHaveClass("opacity-0");
    fireEvent.load(image);
    expect(image).not.toHaveClass("opacity-0");
  });
});
