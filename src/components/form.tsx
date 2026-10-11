// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentProps, type ReactNode, useId } from "react";
import { ApiError } from "@/api/errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A labelled form control with its hint and error. `children` gets the ID and ARIA props. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ");
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        ...(error ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A text input in a Field, showing the server's error for `name` when there is one. */
export function TextField({
  label,
  hint,
  name,
  error,
  className,
  ...input
}: Omit<ComponentProps<"input">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  name: string;
  /** The last failed submit; its error for this field shows below it. */
  error?: unknown;
}) {
  const message = error instanceof ApiError ? error.fieldError(name) : undefined;
  return (
    <Field label={label} hint={hint} error={message} className={className}>
      {(props) => <Input name={name} {...input} {...props} />}
    </Field>
  );
}

/** Reads a form's text fields on submit. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** The second password field of a new-password form; shows when the two differ. */
export function PasswordConfirm({ mismatch, label = "Repeat the password" }: { mismatch: boolean; label?: string }) {
  return (
    <div>
      <TextField label={label} name="confirm" type="password" autoComplete="new-password" required />
      {mismatch ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          The passwords don't match.
        </p>
      ) : null}
    </div>
  );
}
