// SPDX-License-Identifier: GPL-3.0-or-later

import { HttpResponse } from "msw";
import { me, setupStatus, systemInfo } from "./data";
import { type MockOperation, op } from "./op";

/** The mock server: one entry per API operation the app uses. */
export const operations: MockOperation[] = [
  op("get", "/system/info", () => HttpResponse.json(systemInfo)),
  op("get", "/setup", () => HttpResponse.json(setupStatus)),
  op("get", "/me", () => HttpResponse.json(me)),
];

export const handlers = operations.map((operation) => operation.handler);
