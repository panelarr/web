// SPDX-License-Identifier: GPL-3.0-or-later

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  if (typeof window === "undefined") return; // a test in the node environment
  cleanup();
  localStorage.clear();
  for (const cookie of document.cookie.split(";")) {
    // biome-ignore lint/suspicious/noDocumentCookie: clearing what a test set
    document.cookie = `${cookie.split("=")[0]?.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
});
afterAll(() => server.close());

// jsdom lacks these; Radix and the theme code use them.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (typeof window !== "undefined" && typeof window.ResizeObserver !== "function") {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
