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

export const readerUser = {
  id: "7c9d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  username: "reader",
  display_name: "",
  role: "user",
  disabled: false,
  grants: {
    may_add: true,
    may_download: false,
    may_manage_matches: false,
    content_rating_ceiling: "suggestive",
    all_sources: false,
    allowed_sources: ["example:1001"],
  },
  created_at: "2026-10-02T09:00:00Z",
} satisfies Schemas["User"];

export const me = {
  user: adminUser,
  auth: { method: "session", scopes: ["read", "write", "admin"] },
} satisfies Schemas["Me"];

export const session = {
  id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
  current: true,
  user_agent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  ip: "192.0.2.10",
  created_at: "2026-10-10T18:00:00Z",
  last_seen_at: "2026-10-11T08:30:00Z",
  expires_at: "2026-11-10T18:00:00Z",
} satisfies Schemas["Session"];

export const apiKey = {
  id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
  name: "Tablet app",
  prefix: "pnl_8f3a",
  scopes: ["read"],
  created_at: "2026-10-05T10:00:00Z",
  last_used_at: "2026-10-11T07:00:00Z",
} satisfies Schemas["ApiKey"];

export const metaConnection = {
  url: "http://meta:8901",
  managed_by_env: false,
  check: {
    configured: true,
    reachable: true,
    key_valid: true,
    admin_scope: true,
    ready: true,
    providers: [{ id: "example-provider", health: "ok", records: 48210 }],
    checked_at: "2026-10-11T08:00:00Z",
  },
} satisfies Schemas["MetaConnection"];

export const plugin = {
  id: "example",
  url: "http://example-plugin:8904",
  enabled: true,
  name: "Example Source Plugin",
  plugin_id: "example",
  version: "0.1.0",
  contracts: ["panelarr.source.v1"],
  capabilities: ["latest", "search", "filters"],
  has_config: true,
  health: "ok",
  checked_at: "2026-10-11T08:00:00Z",
  source_count: 3,
  created_at: "2026-10-01T12:30:00Z",
} satisfies Schemas["Plugin"];

export const health = {
  status: "ok",
  version: "dev",
  components: [
    { name: "database", required: true, status: "ok", latency_ms: 2 },
    { name: "meta", required: false, status: "ok", latency_ms: 12 },
  ],
} satisfies Schemas["SystemHealth"];

export const sources = [
  {
    id: "example:1001",
    plugin_id: "example",
    name: "Example Source",
    lang: "en",
    content_rating: "safe",
    home_url: "https://example.com",
    capabilities: ["latest", "search", "filters"],
    health: { status: "ok", checked_at: "2026-10-11T08:00:00Z" },
    enabled: true,
    present: true,
  },
  {
    id: "example:1002",
    plugin_id: "example",
    name: "Sample Scans",
    lang: "en",
    content_rating: "mixed",
    home_url: "https://example.org",
    capabilities: ["latest", "search"],
    health: {
      status: "failing",
      reason: "SOURCE_DOWN",
      message: "The site answered 503 for the last 3 checks.",
      checked_at: "2026-10-11T08:00:00Z",
    },
    enabled: true,
    present: true,
  },
  {
    id: "example:1003",
    plugin_id: "example",
    name: "Demo Comics",
    lang: "ja",
    content_rating: "unknown",
    home_url: "https://example.net",
    capabilities: ["search"],
    health: { status: "unknown" },
    enabled: false,
    present: true,
  },
] satisfies Schemas["SourceInfo"][];

/** A plugin's settings, as JSON Schema, the way plugins declare them. */
export const pluginConfig = {
  schema: {
    type: "object",
    required: ["base_url"],
    properties: {
      base_url: {
        type: "string",
        title: "Service URL",
        description: "Where the plugin reaches its backend.",
        format: "uri",
        default: "http://backend:8080",
      },
      api_token: { type: "string", title: "API token", writeOnly: true },
      languages: {
        type: "array",
        title: "Languages",
        description: "Only offer sources in these languages.",
        items: { type: "string", enum: ["en", "ja", "es", "fr"] },
        uniqueItems: true,
      },
      mode: { type: "string", title: "Image quality", enum: ["original", "compressed"], default: "original" },
      max_results: { type: "integer", title: "Results per page", minimum: 1, maximum: 100, default: 20 },
      show_nsfw: { type: "boolean", title: "Show adult sources", default: false },
      proxy: {
        type: "object",
        title: "Proxy",
        properties: {
          url: { type: "string", title: "Proxy URL" },
          enabled: { type: "boolean", title: "Use the proxy" },
        },
      },
    },
  },
  values: {
    base_url: "http://backend:8080",
    api_token: "",
    languages: ["en"],
    mode: "original",
    max_results: 20,
    show_nsfw: false,
    proxy: { url: "", enabled: false },
  },
} satisfies Schemas["PluginConfig"];

export const invite = {
  id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  role: "user",
  grants: {
    may_add: true,
    may_download: false,
    may_manage_matches: false,
    content_rating_ceiling: "suggestive",
    all_sources: true,
    allowed_sources: [],
  },
  note: "For Sam",
  created_at: "2026-10-10T10:00:00Z",
  expires_at: "2099-10-13T10:00:00Z",
} satisfies Schemas["Invite"];

/** Every fixture with the schema it must match. */
export const FIXTURES: ReadonlyArray<readonly [schema: keyof Schemas, value: unknown]> = [
  ["SystemInfo", systemInfo],
  ["SetupStatus", setupStatus],
  ["User", adminUser],
  ["User", readerUser],
  ["Me", me],
  ["Session", session],
  ["ApiKey", apiKey],
  ["MetaConnection", metaConnection],
  ["Plugin", plugin],
  ["SystemHealth", health],
  ...sources.map((source) => ["SourceInfo", source] as const),
  ["PluginConfig", pluginConfig],
  ["Invite", invite],
];
