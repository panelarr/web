// SPDX-License-Identifier: GPL-3.0-or-later

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { apiBaseUrl } from "@/api/client";
import { resetDb } from "@/mocks/db";
import { FakeEventSource } from "./fake-event-source";
import { server } from "./server";
import { SpecValidator } from "./spec-validator";

// Every JSON answer the mock server gives in a test is checked against the spec, so the
// mocks (and the tests built on them) can't drift from what the real server sends.
let validator: SpecValidator;
let responseProblems: string[] = [];

beforeAll(async () => {
  validator = await SpecValidator.load();
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("response:mocked", async ({ request, response }) => {
    const base = apiBaseUrl();
    if (!request.url.startsWith(base) || !/json/.test(response.headers.get("Content-Type") ?? "")) return;
    const path = new URL(request.url).pathname.slice(new URL(base).pathname.length);
    const body = await response.clone().json();
    responseProblems.push(...validator.checkResponse(request.method, path, response.status, body));
  });
});

beforeEach(() => resetDb("ready"));

afterEach(() => {
  server.resetHandlers();
  const problems = responseProblems;
  responseProblems = [];
  if (typeof window !== "undefined") {
    toast.dismiss(); // the toast list is global
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    for (const cookie of document.cookie.split(";")) {
      // biome-ignore lint/suspicious/noDocumentCookie: clearing what a test set
      document.cookie = `${cookie.split("=")[0]?.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
  if (problems.length > 0) throw new Error(`Mock responses don't match the spec:\n  ${problems.join("\n  ")}`);
});

afterAll(() => server.close());

// jsdom lacks these; the event stream, Radix and the theme code use them.
if (typeof window !== "undefined" && typeof window.EventSource !== "function") {
  window.EventSource = FakeEventSource as unknown as typeof EventSource;
}
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
