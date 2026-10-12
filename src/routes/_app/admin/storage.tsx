// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, HardDrive, Loader2, Plus, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { Field, formValues, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format";

type Storage = components["schemas"]["StorageInfo"];
type Kind = Storage["kind"];

export const Route = createFileRoute("/_app/admin/storage")({
  component: StoragePage,
});

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/storages").queryKey });
}

function StoragePage() {
  const storages = $api.useQuery("get", "/storages");
  const [editing, setEditing] = useState<Storage | "new">();
  return (
    <>
      <PageHeader
        title="Storage"
        description="Where downloaded chapters are kept: a directory on the server, or S3-compatible object storage. New downloads go to the default."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add storage
          </Button>
        }
      />
      {storages.error ? <ErrorAlert error={storages.error} onRetry={() => void storages.refetch()} /> : null}
      {storages.isPending ? <Loading /> : null}
      {storages.data?.storages.length === 0 ? <EmptyState icon={<HardDrive />} title="No storage" /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {storages.data?.storages.map((storage) => (
          <StorageCard
            key={storage.id}
            storage={storage}
            others={storages.data.storages.filter((s) => s.id !== storage.id)}
            onEdit={() => setEditing(storage)}
          />
        ))}
      </div>
      {editing ? (
        <StorageDialog storage={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />
      ) : null}
    </>
  );
}

function StorageCard({ storage, others, onEdit }: { storage: Storage; others: Storage[]; onEdit: () => void }) {
  const refresh = useRefresh();
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const path = { params: { path: { storage_id: storage.id } } };
  const test = $api.useMutation("post", "/storages/{storage_id}/test");
  const makeDefault = $api.useMutation("patch", "/storages/{storage_id}", { onSuccess: refresh, onError });
  const remove = $api.useMutation("delete", "/storages/{storage_id}", { onSuccess: refresh, onError });
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const move = $api.useMutation("post", "/storages/{storage_id}/move", {
    onSuccess: () => {
      refresh();
      toast.success("Moving the files. Follow it in Admin → Queue.");
    },
    onError,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
          {storage.name}
          {storage.default ? <Badge>Default</Badge> : null}
        </CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          {storage.id} · {storage.kind === "local" ? "Directory" : "S3-compatible"} · {formatNumber(storage.files)}{" "}
          {storage.files === 1 ? "file" : "files"}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          {storage.kind === "local" ? (
            <Row term="Directory" value={storage.root} />
          ) : (
            <>
              <Row term="Endpoint" value={storage.endpoint} />
              <Row term="Bucket" value={storage.bucket} />
              {storage.prefix ? <Row term="Prefix" value={storage.prefix} /> : null}
              {storage.region ? <Row term="Region" value={storage.region} /> : null}
              <Row term="Access key" value={storage.access_key} />
              <Row term="Secret key" value={storage.has_secret ? "Stored" : "None"} />
            </>
          )}
        </dl>
        {test.data ? (
          <p
            role="status"
            className={
              test.data.ok
                ? "flex items-center gap-2 text-sm text-success"
                : "flex items-start gap-2 text-sm text-destructive"
            }
          >
            {test.data.ok ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span className="[overflow-wrap:anywhere]">
              {test.data.ok ? "It works: written, read and deleted a test file." : test.data.error}
            </span>
          </p>
        ) : null}
        {test.error ? <ErrorAlert error={test.error} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate(path)}>
            {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Test
          </Button>
          {storage.default ? null : (
            <Button
              variant="outline"
              size="sm"
              disabled={makeDefault.isPending}
              onClick={() => makeDefault.mutate({ ...path, body: { default: true } })}
            >
              Make default
            </Button>
          )}
          {storage.files > 0 && others.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Move files…
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Move {formatNumber(storage.files)} files from {storage.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    They stay readable while they move. It runs as a task with progress.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Field label="Move to">
                  {(aria) => (
                    <NativeSelect {...aria} value={target} onChange={(e) => setTarget(e.target.value)}>
                      {others.map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => move.mutate({ ...path, body: { to: target } })}>
                    Move
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {storage.default ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {storage.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Only an empty storage can be removed. Nothing is deleted from the directory or bucket itself.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => remove.mutate(path)}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ term, value }: { term: string; value: string | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-mono text-xs leading-5 [overflow-wrap:anywhere]">{value || "—"}</dd>
    </>
  );
}

/** Adds a storage, or edits one; the server checks it before saving. */
function StorageDialog({ storage, onClose }: { storage: Storage | undefined; onClose: () => void }) {
  const refresh = useRefresh();
  const [kind, setKind] = useState<Kind>(storage?.kind ?? "local");
  const [pathStyle, setPathStyle] = useState(storage?.path_style ?? false);
  const done = () => {
    refresh();
    toast.success(storage ? "Storage saved." : "Storage added.");
    onClose();
  };
  const create = $api.useMutation("post", "/storages", { onSuccess: done });
  const update = $api.useMutation("patch", "/storages/{storage_id}", { onSuccess: done });
  const error = create.error ?? update.error;
  const pending = create.isPending || update.isPending;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const v = formValues(event.currentTarget);
            const settings =
              kind === "local"
                ? { name: v.name ?? "", root: v.root ?? "" }
                : {
                    name: v.name ?? "",
                    endpoint: v.endpoint ?? "",
                    region: v.region ?? "",
                    bucket: v.bucket ?? "",
                    prefix: v.prefix ?? "",
                    path_style: pathStyle,
                    access_key: v.access_key ?? "",
                    ...(v.secret_key ? { secret_key: v.secret_key } : {}),
                  };
            if (storage) update.mutate({ params: { path: { storage_id: storage.id } }, body: settings });
            else create.mutate({ body: { ...settings, id: v.id ?? "", kind } });
          }}
        >
          <DialogHeader>
            <DialogTitle>{storage ? `Edit ${storage.name}` : "Add storage"}</DialogTitle>
            <DialogDescription>The server writes, reads and deletes a test file before saving.</DialogDescription>
          </DialogHeader>
          {error ? <ErrorAlert error={error} title="Not saved" /> : null}
          {storage ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="ID"
                name="id"
                required
                pattern="[a-z0-9][a-z0-9_\-]{0,39}"
                autoCapitalize="none"
                hint="Lowercase; it can't change."
                error={error}
              />
              <Field label="Kind">
                {(aria) => (
                  <NativeSelect {...aria} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                    <option value="local">Directory on the server</option>
                    <option value="s3">S3-compatible</option>
                  </NativeSelect>
                )}
              </Field>
            </div>
          )}
          <TextField label="Name" name="name" required maxLength={100} defaultValue={storage?.name} error={error} />
          {kind === "local" ? (
            <TextField
              label="Directory"
              name="root"
              required
              defaultValue={storage?.root}
              placeholder="/data/library"
              hint="An absolute path the server can write to."
              error={error}
            />
          ) : (
            <>
              <TextField
                label="Endpoint"
                name="endpoint"
                type="url"
                required
                defaultValue={storage?.endpoint}
                placeholder="https://s3.example.com"
                error={error}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Bucket" name="bucket" required defaultValue={storage?.bucket} error={error} />
                <TextField label="Region" name="region" defaultValue={storage?.region} error={error} />
              </div>
              <TextField
                label="Prefix"
                name="prefix"
                defaultValue={storage?.prefix}
                hint="Optional folder inside the bucket."
                error={error}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Access key"
                  name="access_key"
                  defaultValue={storage?.access_key}
                  autoComplete="off"
                  error={error}
                />
                <TextField
                  label="Secret key"
                  name="secret_key"
                  type="password"
                  autoComplete="off"
                  hint={storage?.has_secret ? "Leave empty to keep the stored one." : undefined}
                  error={error}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="path-style"
                  checked={pathStyle}
                  onCheckedChange={(checked) => setPathStyle(checked === true)}
                />
                <Label htmlFor="path-style" className="font-normal">
                  Path-style addressing (most self-hosted servers)
                </Label>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {storage ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
