// SPDX-License-Identifier: GPL-3.0-or-later

import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ApiError } from "@/api/errors";
import { Field } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** The part of JSON Schema plugins use to declare their settings. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

type Values = Record<string, unknown>;

function typeOf(schema: JsonSchema): string | undefined {
  return Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
}

/** The values to start with: what's saved, else the schema's defaults. */
export function initialValues(schema: JsonSchema, saved: Values | undefined): Values {
  const out: Values = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const value = saved?.[key];
    if (typeOf(prop) === "object") {
      out[key] = initialValues(prop, (value as Values | undefined) ?? (prop.default as Values | undefined));
    } else {
      out[key] = value !== undefined ? value : prop.default;
    }
  }
  return out;
}

function label(name: string, schema: JsonSchema): string {
  return schema.title ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

/** A form generated from a JSON Schema: plugin settings and the like. */
export function SchemaForm({
  schema,
  values: saved,
  onSubmit,
  pending,
  error,
  submitLabel = "Save",
}: {
  schema: JsonSchema;
  values?: Values;
  onSubmit: (values: Values) => void;
  pending?: boolean;
  error?: unknown;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(schema, saved));
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : [];
  const otherError = error && !(error instanceof ApiError && error.fieldErrors.length > 0) ? error : undefined;
  return (
    <form
      className="grid gap-5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {otherError ? <ErrorAlert error={otherError} /> : null}
      {error instanceof ApiError && fieldErrors.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {error.detail ?? "Some settings need fixing."}
        </p>
      ) : null}
      <ObjectFields
        schema={schema}
        value={values}
        onChange={setValues}
        path=""
        errors={Object.fromEntries(fieldErrors.map((e) => [e.field, e.message]))}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps<T> {
  name: string;
  schema: JsonSchema;
  value: T;
  onChange: (value: T) => void;
  path: string;
  required: boolean;
  errors: Record<string, string>;
}

function ObjectFields({
  schema,
  value,
  onChange,
  path,
  errors,
}: {
  schema: JsonSchema;
  value: Values;
  onChange: (value: Values) => void;
  path: string;
  errors: Record<string, string>;
}) {
  return (
    <>
      {Object.entries(schema.properties ?? {}).map(([name, prop]) => (
        <SchemaField
          key={name}
          name={name}
          schema={prop}
          value={value[name]}
          onChange={(next) => onChange({ ...value, [name]: next })}
          path={path ? `${path}.${name}` : name}
          required={schema.required?.includes(name) ?? false}
          errors={errors}
        />
      ))}
    </>
  );
}

function SchemaField(props: FieldProps<unknown>) {
  const { name, schema, value, onChange, path, required, errors } = props;
  const type = typeOf(schema);
  const error = errors[path];
  const hint = schema.writeOnly
    ? [schema.description, "Secret: leave empty to keep the saved value."].filter(Boolean).join(" ")
    : schema.description;

  if (type === "object") {
    return (
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">{label(name, schema)}</legend>
        {schema.description ? <p className="-mt-2 text-xs text-muted-foreground">{schema.description}</p> : null}
        <ObjectFields
          schema={schema}
          value={(value as Values | undefined) ?? {}}
          onChange={onChange}
          path={path}
          errors={errors}
        />
      </fieldset>
    );
  }

  if (type === "boolean") return <BooleanField {...props} value={value === true} hint={hint} error={error} />;

  if (type === "array" && schema.items?.enum) {
    return <ChoicesField {...props} value={Array.isArray(value) ? value : []} hint={hint} error={error} />;
  }

  return (
    <Field label={label(name, schema)} hint={hint} error={error}>
      {(aria) => {
        if (schema.enum) {
          return (
            <NativeSelect
              {...aria}
              value={value === undefined ? "" : String(value)}
              required={required}
              onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            >
              {required ? null : <option value="">Not set</option>}
              {schema.enum.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {String(option)}
                </option>
              ))}
            </NativeSelect>
          );
        }
        if (type === "array") {
          // A list of free text: one item per line.
          return (
            <Textarea
              {...aria}
              rows={4}
              value={Array.isArray(value) ? value.join("\n") : ""}
              onChange={(e) =>
                onChange(
                  e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                )
              }
            />
          );
        }
        if (type === "integer" || type === "number") {
          return (
            <Input
              {...aria}
              type="number"
              inputMode={type === "integer" ? "numeric" : "decimal"}
              step={type === "integer" ? 1 : "any"}
              min={schema.minimum}
              max={schema.maximum}
              required={required}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          );
        }
        if (type === "string" || type === undefined) {
          const secret = schema.writeOnly || schema.format === "password";
          return (
            <Input
              {...aria}
              type={
                secret ? "password" : schema.format === "uri" ? "url" : schema.format === "email" ? "email" : "text"
              }
              autoComplete={secret ? "off" : undefined}
              required={required && !schema.writeOnly}
              minLength={schema.minLength}
              maxLength={schema.maxLength}
              pattern={schema.pattern}
              value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value)}
            />
          );
        }
        return (
          <Textarea {...aria} className="font-mono text-xs" value={JSON.stringify(value ?? null, null, 2)} readOnly />
        );
      }}
    </Field>
  );
}

function BooleanField({
  name,
  schema,
  value,
  onChange,
  hint,
  error,
}: FieldProps<boolean> & { hint?: string | undefined; error?: string | undefined }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label(name, schema)}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function ChoicesField({
  name,
  schema,
  value,
  onChange,
  hint,
  error,
}: FieldProps<unknown[]> & { hint?: string | undefined; error?: string | undefined }) {
  const id = useId();
  const options = schema.items?.enum ?? [];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label(name, schema)}</legend>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => {
          const optionId = `${id}-${String(option)}`;
          return (
            <div key={String(option)} className="flex items-center gap-2">
              <Checkbox
                id={optionId}
                checked={value.includes(option)}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...value, option] : value.filter((v) => v !== option))
                }
              />
              <Label htmlFor={optionId} className="font-normal">
                {String(option)}
              </Label>
            </div>
          );
        })}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </fieldset>
  );
}
