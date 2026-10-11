// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { descriptionParagraphs, pickDescription } from "./description";

describe("descriptionParagraphs", () => {
  it("turns HTML into text, never markup", () => {
    const paragraphs = descriptionParagraphs({
      format: "html",
      text: '<p>First <b>bold</b> line<br>next</p><p>Second<img src=x onerror="alert(1)"></p><script>alert(2)</script>',
    });
    expect(paragraphs).toEqual(["First bold line\nnext", "Second", "alert(2)"]);
  });

  it("drops Markdown markers", () => {
    expect(descriptionParagraphs({ format: "markdown", text: "# Title\n\n**Bold** and [a link](https://x)." })).toEqual(
      ["Title", "Bold and a link."],
    );
  });

  it("splits plain text into paragraphs", () => {
    expect(descriptionParagraphs({ format: "plain", text: "One.\n\n\nTwo\nlines." })).toEqual(["One.", "Two\nlines."]);
  });
});

describe("pickDescription", () => {
  const list = [
    { format: "plain" as const, text: "ja", language: "ja" },
    { format: "plain" as const, text: "en", language: "en" },
  ];
  it("prefers the reader's languages", () => {
    expect(pickDescription(list, ["en-GB"])?.text).toBe("en");
    expect(pickDescription(list, ["fr", "ja"])?.text).toBe("ja");
    expect(pickDescription(list, ["fr"])?.text).toBe("ja");
  });
});
