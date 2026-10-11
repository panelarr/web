// SPDX-License-Identifier: GPL-3.0-or-later

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { loadSpec } from "../../scripts/spec.mjs";

interface Operation {
  method: string;
  pattern: RegExp;
  path: string;
  responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

/** Validates values and responses against the API's schemas (the server's spec plus the drafts). */
export class SpecValidator {
  private constructor(
    private readonly ajv: Ajv2020,
    private readonly operations: Operation[],
  ) {}

  static async load(): Promise<SpecValidator> {
    const { spec } = await loadSpec();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    for (const format of ["int32", "int64", "float", "double", "byte", "binary", "password"]) {
      ajv.addFormat(format, true);
    }
    ajv.addSchema({ $id: "spec", components: spec.components });
    const operations: Operation[] = [];
    for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
      for (const [method, op] of Object.entries(item)) {
        const responses = (op as { responses?: Operation["responses"] }).responses;
        if (!responses) continue;
        const pattern = new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`);
        operations.push({ method: method.toUpperCase(), pattern, path, responses });
      }
    }
    return new SpecValidator(ajv, operations);
  }

  schema(name: string): ValidateFunction {
    const validate = this.ajv.getSchema(`spec#/components/schemas/${name}`);
    if (!validate) throw new Error(`The spec has no schema ${name}`);
    return validate;
  }

  private readonly compiled = new Map<unknown, ValidateFunction>();

  private compile(schema: unknown): ValidateFunction {
    let validate = this.compiled.get(schema);
    if (!validate) {
      const ref = (schema as { $ref?: string }).$ref;
      validate = ref
        ? (this.ajv.getSchema(`spec${ref}`) as ValidateFunction)
        : this.ajv.compile(JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"spec#/components/')));
      this.compiled.set(schema, validate);
    }
    return validate;
  }

  /** Problems with a JSON response to `method apiPath` (relative to /api/v1); empty when it fits. */
  checkResponse(method: string, apiPath: string, status: number, body: unknown): string[] {
    const operation = this.operations.find((o) => o.method === method && o.pattern.test(apiPath));
    if (!operation) return [`${method} ${apiPath} isn't in the spec`];
    const response = operation.responses[String(status)] ?? operation.responses.default;
    if (!response) return [`${method} ${operation.path} has no ${status} response in the spec`];
    const content = response.content ?? {};
    const schema = (content["application/json"] ?? content["application/problem+json"])?.schema;
    if (!schema) return [];
    const validate = this.compile(schema);
    if (validate(body)) return [];
    return (validate.errors ?? []).map(
      (e) => `${method} ${operation.path} ${status}: ${e.instancePath || "(body)"} ${e.message}`,
    );
  }
}
