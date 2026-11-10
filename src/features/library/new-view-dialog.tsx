// SPDX-License-Identifier: GPL-3.0-or-later

import { type FormEvent, useId, useState } from "react";
import { ApiError, errorMessage } from "@/api/errors";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_VIEW, type SavedView, toDefinition, type ViewDefinition } from "./library-view";
import { type LibraryViews, MAX_VIEW_NAME } from "./use-library-views";

/** New view…: a name, and whether it starts as a copy of the view shown or from everything. */
export function NewViewDialog({
  open,
  onOpenChange,
  views,
  current,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: LibraryViews;
  /** The view shown now, to start from. */
  current: { name: string; definition: ViewDefinition } | undefined;
  onCreated: (view: SavedView) => void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState<"this" | "everything">("this");
  const [error, setError] = useState<string>();
  const radio = useId();
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setFrom("this");
      setError(undefined);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the view a name.");
      return;
    }
    const definition = from === "this" && current ? current.definition : toDefinition(DEFAULT_VIEW);
    try {
      const view = await views.create.mutateAsync({ name: trimmed, definition });
      close(false);
      onCreated(view);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "name_taken"
          ? "You have a view with this name."
          : e instanceof ApiError && e.code === "view_limit"
            ? "You have as many views as you can keep (50). Delete one first."
            : errorMessage(e),
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New view</DialogTitle>
            <DialogDescription>A view keeps its own filters, sort and display.</DialogDescription>
          </DialogHeader>
          <Field label="Name" error={error}>
            {(props) => (
              <Input
                {...props}
                value={name}
                maxLength={MAX_VIEW_NAME}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          {current ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Start from</legend>
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id={`${radio}-this`}
                  name="from"
                  checked={from === "this"}
                  onChange={() => setFrom("this")}
                  className="size-4 accent-primary"
                />
                <Label htmlFor={`${radio}-this`} className="min-w-0 font-normal">
                  <span className="truncate">This view ({current.name})</span>
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id={`${radio}-all`}
                  name="from"
                  checked={from === "everything"}
                  onChange={() => setFrom("everything")}
                  className="size-4 accent-primary"
                />
                <Label htmlFor={`${radio}-all`} className="font-normal">
                  Everything
                </Label>
              </div>
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={views.create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
