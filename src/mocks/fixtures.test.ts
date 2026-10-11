// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeAll, describe, expect, it } from "vitest";
import { SpecValidator } from "@/test/spec-validator";
import { FIXTURES } from "./data";
import { createDb, SCENARIOS } from "./db";

// The mocks must answer what the real server would: every fixture is checked against the
// API's schemas (the server's spec plus the drafts). Responses are checked too (src/test/setup.ts).
let validator: SpecValidator;

beforeAll(async () => {
  validator = await SpecValidator.load();
});

describe("mock fixtures", () => {
  it.each(FIXTURES.map(([schema, value], i) => [`${schema} #${i}`, schema, value] as const))(
    "%s matches the spec",
    (_label, schema, value) => {
      const validate = validator.schema(schema);
      validate(value);
      expect(validate.errors ?? []).toEqual([]);
    },
  );

  it.each(SCENARIOS)("the %s scenario's state matches the spec", (scenario) => {
    const db = createDb(scenario);
    const check = (schema: string, value: unknown) => {
      const validate = validator.schema(schema);
      validate(value);
      expect(validate.errors ?? [], `${scenario} ${schema}`).toEqual([]);
    };
    for (const user of db.users) check("User", user);
    for (const session of db.sessions) check("Session", session);
    for (const key of db.apiKeys) check("ApiKey", key);
    for (const plugin of db.plugins) check("Plugin", plugin);
    for (const source of db.sources) check("SourceInfo", source);
    for (const config of Object.values(db.pluginConfigs)) check("PluginConfig", config);
    for (const { token: _token, ...invite } of db.invites) check("Invite", invite);
    check("MetaConnection", db.meta);
  });

  it("catches a fixture that doesn't match", () => {
    expect(validator.schema("SystemInfo")({ name: "something-else", version: 1 })).toBe(false);
  });
});
