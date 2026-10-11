// SPDX-License-Identifier: GPL-3.0-or-later

import { setupServer } from "msw/node";
import { handlers } from "@/mocks/handlers";

/** The mock server for tests; override per test with `server.use(...)`. */
export const server = setupServer(...handlers);
