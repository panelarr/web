// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { useIsAdmin } from "@/auth/session";
import { CopyField } from "@/components/copy-field";
import { Field, formValues, TextField } from "@/components/form";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatRelative } from "@/lib/format";

type Scope = components["schemas"]["ApiKeyScope"];
type ApiKey = components["schemas"]["ApiKey"];

const SCOPES: ReadonlyArray<{ id: Scope; label: string; hint: string; admin?: boolean }> = [
  { id: "read", label: "Read", hint: "See your library, progress and everything you can browse." },
  { id: "write", label: "Write", hint: "Change things: add works, save progress, queue downloads." },
  { id: "admin", label: "Admin", hint: "Admin endpoints (users, plugins, jobs).", admin: true },
  { id: "metrics:read", label: "Metrics", hint: "Read the server's Prometheus metrics.", admin: true },
];

const keysQuery = () => $api.queryOptions("get", "/me/api-keys");

export function ApiKeysCard() {
  const keys = $api.useQuery("get", "/me/api-keys");
  const [creating, setCreating] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>For other apps and scripts that use Panelarr's API as you.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New key
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {keys.error ? <ErrorAlert error={keys.error} onRetry={() => void keys.refetch()} /> : null}
        {keys.isPending ? <Loading /> : null}
        {keys.data?.api_keys.length === 0 ? (
          <EmptyState icon={<KeyRound />} title="No API keys" className="py-10" />
        ) : null}
        {keys.data && keys.data.api_keys.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {keys.data.api_keys.map((key) => (
              <KeyRow key={key.id} apiKey={key} />
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const queryClient = useQueryClient();
  const revoke = $api.useMutation("delete", "/me/api-keys/{id}", {
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keysQuery().queryKey }),
  });
  const expired = apiKey.expires_at ? Date.parse(apiKey.expires_at) < Date.now() : false;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium [overflow-wrap:anywhere]">
          {apiKey.name} <span className="font-mono text-xs text-muted-foreground">{apiKey.prefix}…</span>
        </p>
        <p className="mt-1 flex flex-wrap gap-1">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scope}
            </Badge>
          ))}
          {expired ? <Badge variant="destructive">expired</Badge> : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Created {formatDate(apiKey.created_at)}
          {apiKey.last_used_at ? ` · used ${formatRelative(apiKey.last_used_at)}` : " · never used"}
          {apiKey.expires_at && !expired ? ` · expires ${formatDate(apiKey.expires_at)}` : ""}
        </p>
        {revoke.error ? <ErrorAlert error={revoke.error} /> : null}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{apiKey.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps using this key stop working at once. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => revoke.mutate({ params: { path: { id: apiKey.id } } })}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [scopes, setScopes] = useState<Scope[]>(["read"]);
  const create = $api.useMutation("post", "/me/api-keys", {
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keysQuery().queryKey }),
  });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Forget the key: it is shown once only.
      create.reset();
      setScopes(["read"]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {create.data ? (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>Copy it now. It won't be shown again.</DialogDescription>
            </DialogHeader>
            <CopyField label="API key" value={create.data.key} />
            <Alert>
              <AlertDescription>
                Send it as <code className="font-mono">X-Api-Key</code> or as a bearer token. Keep it secret: it acts as
                you.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const { name = "", expires = "" } = formValues(event.currentTarget);
              create.mutate({
                body: {
                  name,
                  scopes,
                  ...(expires ? { expires_at: new Date(`${expires}T23:59:59`).toISOString() } : {}),
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>Give it only the access it needs.</DialogDescription>
            </DialogHeader>
            {create.error ? <ErrorAlert error={create.error} /> : null}
            <TextField
              label="Name"
              name="name"
              required
              maxLength={100}
              placeholder="e.g. Tablet app"
              error={create.error}
            />
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">Access</legend>
              {SCOPES.filter((scope) => isAdmin || !scope.admin).map((scope) => (
                <div key={scope.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`scope-${scope.id}`}
                    checked={scopes.includes(scope.id)}
                    onCheckedChange={(checked) =>
                      setScopes((prev) => (checked ? [...prev, scope.id] : prev.filter((s) => s !== scope.id)))
                    }
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor={`scope-${scope.id}`}>{scope.label}</Label>
                    <p className="text-xs text-muted-foreground">{scope.hint}</p>
                  </div>
                </div>
              ))}
            </fieldset>
            <Field label="Expires" hint="Optional. The key stops working at the end of that day.">
              {(props) => <Input type="date" name="expires" min={new Date().toISOString().slice(0, 10)} {...props} />}
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || scopes.length === 0}>
                {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
