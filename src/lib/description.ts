// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";

type Description = components["schemas"]["CatalogDescription"];

/**
 * A description as plain paragraphs. Metadata comes from third parties, so it is never
 * rendered as HTML: HTML is parsed into text (nothing in it runs or loads), and Markdown
 * markers are dropped.
 */
export function descriptionParagraphs(description: Description): string[] {
  let text = description.text;
  if (description.format === "html") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    for (const br of doc.querySelectorAll("br")) br.replaceWith("\n");
    for (const block of doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6")) block.append("\n\n");
    text = doc.body.textContent ?? "";
  } else if (description.format === "markdown") {
    text = text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|\*|_|`)/g, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/^>\s?/gm, "");
  }
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t]*\n[ \t]*/g, "\n").trim())
    .filter(Boolean);
}

/** The description in the first language the reader prefers, else the first one. */
export function pickDescription(
  descriptions: Description[],
  languages: readonly string[] = navigator.languages,
): Description | undefined {
  for (const language of languages) {
    const base = language.split("-")[0];
    const found =
      descriptions.find((d) => d.language === language) ?? descriptions.find((d) => d.language?.split("-")[0] === base);
    if (found) return found;
  }
  return descriptions[0];
}
