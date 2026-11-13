// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Share2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { inviteLink } from "@/auth/invite-link";
import { systemAuthQuery } from "@/auth/sso";
import { CopyField } from "@/components/copy-field";
import { Field, formValues, PasswordConfirm, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { escapeClearsSearchFirst } from "@/components/search-input";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_GRANTS, type Grants, type Role } from "./grants";
import { GrantsEditor } from "./grants-editor";

const dialogClass = "sm:max-w-lg";

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <Field label="Role" hint="Admins manage users, plugins and settings.">
      {(aria) => (
        <NativeSelect {...aria} value={value} onChange={(e) => onChange(e.target.value as Role)}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </NativeSelect>
      )}
    </Field>
  );
}

export function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>("user");
  const [grants, setGrants] = useState<Grants>(DEFAULT_GRANTS);
  const [mismatch, setMismatch] = useState(false);
  const create = $api.useMutation("post", "/users", {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/users").queryKey });
      close(false);
    },
  });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      create.reset();
      setRole("user");
      setGrants(DEFAULT_GRANTS);
      setMismatch(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={dialogClass} onEscapeKeyDown={escapeClearsSearchFirst}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const { username = "", password = "", confirm = "", display_name = "" } = formValues(event.currentTarget);
            setMismatch(password !== confirm);
            if (password !== confirm) return;
            create.mutate({
              body: { username, password, role, grants, ...(display_name ? { display_name } : {}) },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
            <DialogDescription>Set their password yourself, or send an invite link instead.</DialogDescription>
          </DialogHeader>
          {isApiError(create.error, "username_taken") ? (
            <p role="alert" className="text-sm text-destructive">
              {create.error.detail ?? "That username is taken."}
            </p>
          ) : create.error && !isApiError(create.error, "invalid_request") ? (
            <ErrorAlert error={create.error} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Username"
              name="username"
              required
              minLength={2}
              maxLength={64}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]*"
              autoCapitalize="none"
              autoComplete="off"
              error={create.error}
            />
            <TextField label="Display name" name="display_name" maxLength={100} error={create.error} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={256}
              autoComplete="new-password"
              error={create.error}
            />
            <PasswordConfirm mismatch={mismatch} />
          </div>
          <RoleSelect value={role} onChange={setRole} />
          <GrantsEditor value={grants} onChange={setGrants} isAdmin={role === "admin"} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * With admin groups configured, the identity provider decides who is an admin at every single
 * sign-on: an admin invite accepted by someone outside those groups creates a user.
 */
function AdminRoleFromGroups({ role }: { role: Role }) {
  const auth = useQuery({ ...systemAuthQuery(), enabled: role === "admin" });
  const groups = auth.data?.oidc.enabled ? (auth.data.oidc.admin_groups ?? []) : [];
  if (role !== "admin" || groups.length === 0) return null;
  return (
    <Alert>
      <TriangleAlert aria-hidden />
      <AlertTitle>The identity provider manages the admin role</AlertTitle>
      <AlertDescription>
        Single sign-on makes members of {groups.join(", ")} admins and everyone else a user. If they accept with SSO and
        aren't in {groups.length === 1 ? "that group" : "one of those groups"}, they become a user.
      </AlertDescription>
    </Alert>
  );
}

const EXPIRIES = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
] as const;

export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>("user");
  const [grants, setGrants] = useState<Grants>(DEFAULT_GRANTS);
  const create = $api.useMutation("post", "/invites", {
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/invites").queryKey }),
  });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // The token is shown once: forget it.
      create.reset();
      setRole("user");
      setGrants(DEFAULT_GRANTS);
    }
  };
  const link = create.data ? inviteLink(create.data.token) : undefined;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={dialogClass} onEscapeKeyDown={escapeClearsSearchFirst}>
        {create.data && link ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite link</DialogTitle>
              <DialogDescription>
                Send it to the person you're inviting. It works once, until{" "}
                {formatDateTime(create.data.invite.expires_at)}, and isn't shown again.
              </DialogDescription>
            </DialogHeader>
            <CopyField label="Invite link" value={link} />
            <DialogFooter>
              {typeof navigator.share === "function" ? (
                <Button
                  variant="outline"
                  onClick={() => void navigator.share({ title: "Join Panelarr", url: link }).catch(() => {})}
                >
                  <Share2 aria-hidden />
                  Share
                </Button>
              ) : null}
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const { note = "", expires = "72" } = formValues(event.currentTarget);
              create.mutate({ body: { role, grants, note, expires_in_hours: Number(expires) } });
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>They pick their own username and password.</DialogDescription>
            </DialogHeader>
            {create.error ? <ErrorAlert error={create.error} /> : null}
            <TextField label="Note" name="note" maxLength={200} placeholder="Who it's for" hint="Only admins see it." />
            <Field label="Valid for">
              {(aria) => (
                <NativeSelect {...aria} name="expires" defaultValue="72">
                  {EXPIRIES.map((option) => (
                    <option key={option.hours} value={option.hours}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <RoleSelect value={role} onChange={setRole} />
            <AdminRoleFromGroups role={role} />
            <GrantsEditor value={grants} onChange={setGrants} isAdmin={role === "admin"} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Create invite link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
