// SPDX-License-Identifier: GPL-3.0-or-later

import { Loader2, Plus } from "lucide-react";
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
  /** Where a property goes among its siblings (lowest first); either spelling. */
  "x-order"?: number;
  propertyOrder?: number;
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

/**
 * An object's properties in display order. A schema can travel through maps that sort its
 * keys (protobuf Struct, Go's JSON encoder), so the order it arrives in may not be the one it
 * was written in. An `x-order` or `propertyOrder` hint wins; keys in alphabetical order most
 * likely lost theirs, so required ones go first; any other order is the author's, and kept.
 */
export function orderedProperties(schema: JsonSchema): [string, JsonSchema][] {
  const entries = Object.entries(schema.properties ?? {});
  const hint = (prop: JsonSchema) => prop["x-order"] ?? prop.propertyOrder;
  if (entries.some(([, prop]) => typeof hint(prop) === "number")) {
    // Hinted ones first, by hint; the rest after, as they came. sort() is stable.
    const rank = (prop: JsonSchema) => hint(prop) ?? Number.MAX_SAFE_INTEGER;
    return entries.sort(([, a], [, b]) => rank(a) - rank(b));
  }
  const names = entries.map(([name]) => name);
  const sorted = names.every((name, i) => i === 0 || (names[i - 1] as string) <= name);
  if (!sorted) return entries;
  const required = new Set(schema.required ?? []);
  return entries.sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)));
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
      {orderedProperties(schema).map(([name, prop]) => (
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

  if (type === "array" && schema.items && typeOf(schema.items) === "object") {
    return (
      <ObjectListField {...props} value={Array.isArray(value) ? (value as Values[]) : []} hint={hint} error={error} />
    );
  }

  if (type === "array" && schema.items?.enum) {
    return <ChoicesField {...props} value={Array.isArray(value) ? value : []} hint={hint} error={error} />;
  }

  return (
    <Field
      label={label(name, schema)}
      hint={type === "array" && !schema.enum ? [hint, "One per line."].filter(Boolean).join(" ") : hint}
      error={error}
    >
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
          return <LinesInput {...aria} value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />;
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
      <AllOnOff label={label(name, schema)} onAll={(on) => onChange(on ? [...options] : [])} />
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

/**
 * A list of free text, one item per line. It keeps what is typed (blank lines too, so Enter
 * starts the next item) and hands on the non-empty lines.
 */
function LinesInput({
  value,
  onChange,
  ...aria
}: { value: string[]; onChange: (value: string[]) => void } & React.ComponentProps<"textarea">) {
  const [text, setText] = useState(() => value.join("\n"));
  return (
    <Textarea
      {...aria}
      rows={4}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

/** A list of objects (say, stores with a URL and a key): one card of fields per item. */
function ObjectListField({
  name,
  schema,
  value,
  onChange,
  path,
  errors,
  hint,
  error,
}: FieldProps<Values[]> & { hint?: string | undefined; error?: string | undefined }) {
  const items = schema.items ?? {};
  const noun = items.title ?? "Item";
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{label(name, schema)}</legend>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {value.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : null}
      {value.map((item, index) => (
        // Items have no identity of their own; the fields are controlled, so the index is enough.
        <div key={index} className="grid gap-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {noun} {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${noun.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
          <ObjectFields
            schema={items}
            value={item ?? {}}
            onChange={(next) => onChange(value.map((old, i) => (i === index ? next : old)))}
            path={`${path}.${index}`}
            errors={errors}
          />
        </div>
      ))}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, initialValues(items, undefined)])}
        >
          <Plus aria-hidden />
          Add {noun.toLowerCase()}
        </Button>
      </div>
    </fieldset>
  );
}

/** "All on" and "All off" for a list of checkboxes. */
export function AllOnOff({ label, onAll }: { label: string; onAll: (on: boolean) => void }) {
  return (
    <div className="-ml-2 flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={`${label}: all on`}
        onClick={() => onAll(true)}
      >
        All on
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={`${label}: all off`}
        onClick={() => onAll(false)}
      >
        All off
      </Button>
    </div>
  );
}
