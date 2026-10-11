// SPDX-License-Identifier: GPL-3.0-or-later

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSpec } from "../../scripts/spec.mjs";
import { FIXTURES } from "./data";

// The mocks must answer what the real server would: every fixture is checked against the
// API's schemas (the server's spec plus the drafts), so a spec change that breaks them fails here.
let ajv: Ajv2020;

beforeAll(async () => {
  const { spec } = await loadSpec();
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const format of ["int32", "int64", "float", "double", "byte", "binary", "password"]) ajv.addFormat(format, true);
  ajv.addSchema({ $id: "spec", components: spec.components });
});

describe("mock fixtures", () => {
  it.each(FIXTURES.map(([schema, value]) => [schema, value] as const))("%s matches the spec", (schema, value) => {
    const validate = ajv.getSchema(`spec#/components/schemas/${schema}`);
    expect(validate, `no schema ${schema}`).toBeDefined();
    const ok = validate?.(value);
    expect(validate?.errors ?? [], JSON.stringify(validate?.errors)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("catches a fixture that doesn't match", () => {
    const validate = ajv.getSchema("spec#/components/schemas/SystemInfo");
    expect(validate?.({ name: "something-else", version: 1 })).toBe(false);
  });
});
