// SPDX-License-Identifier: GPL-3.0-or-later

import { type HttpHandler, http } from "msw";
import { apiBaseUrl } from "@/api/client";
import { draftOperations } from "@/api/drafts.gen";
import type { paths } from "@/api/schema.gen";

type Method = "get" | "post" | "put" | "patch" | "delete";

/** A mock for one API operation, by its spec path, so mocks can be picked by draft status. */
export interface MockOperation {
  method: Method;
  path: keyof paths & string;
  handler: HttpHandler;
}

/** "/jobs/{job_id}" → "http://host/api/v1/jobs/:job_id" */
export function mockUrl(path: string): string {
  return apiBaseUrl() + path.replace(/\{([^}]+)\}/g, ":$1");
}

export function op<P extends keyof paths & string>(
  method: Method,
  path: P,
  resolver: Parameters<typeof http.get>[1],
): MockOperation {
  return { method, path, handler: http[method](mockUrl(path), resolver) };
}

export function isDraft(operation: MockOperation): boolean {
  return draftOperations.some((d) => d.method === operation.method.toUpperCase() && d.path === operation.path);
}

/** The JSON body of an RFC 9457 problem, as the server sends it. */
export function problem(status: number, code: string, title: string, detail?: string) {
  return Response.json(
    { type: "about:blank", title, status, code, detail, request_id: `mock-${code}` },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
