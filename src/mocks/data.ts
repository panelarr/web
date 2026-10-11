// SPDX-License-Identifier: GPL-3.0-or-later

// Made-up data for the mock server and tests. Never put real sites, extensions or records
// here. src/mocks/fixtures.test.ts checks every fixture against the API's schemas.
import type { components } from "@/api/schema.gen";

type Schemas = components["schemas"];

export const systemInfo = {
  name: "panelarr",
  version: "dev",
  setup_required: false,
} satisfies Schemas["SystemInfo"];

export const setupStatus = {
  admin_created: true,
  meta_configured: true,
  meta_ready: true,
  completed: true,
  completed_at: "2026-10-01T12:00:00Z",
} satisfies Schemas["SetupStatus"];

export const adminUser = {
  id: "0f4a2c4e-6b1d-4c8e-9a51-1d2f3b4c5d6e",
  username: "admin",
  display_name: "Admin",
  role: "admin",
  disabled: false,
  grants: {
    may_add: true,
    may_download: true,
    may_manage_matches: true,
    content_rating_ceiling: "pornographic",
    all_sources: true,
    allowed_sources: [],
  },
  created_at: "2026-10-01T12:00:00Z",
  last_login_at: "2026-10-11T08:30:00Z",
} satisfies Schemas["User"];

export const me = {
  user: adminUser,
  auth: { method: "session", scopes: ["read", "write", "admin"] },
} satisfies Schemas["Me"];

/** Every fixture with the schema it must match. */
export const FIXTURES: ReadonlyArray<readonly [schema: keyof Schemas, value: unknown]> = [
  ["SystemInfo", systemInfo],
  ["SetupStatus", setupStatus],
  ["User", adminUser],
  ["Me", me],
];
