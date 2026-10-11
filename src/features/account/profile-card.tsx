// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { useMe } from "@/auth/session";
import { formValues, TextField } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileCard() {
  const { user } = useMe();
  const queryClient = useQueryClient();
  const update = $api.useMutation("patch", "/me", {
    onSuccess: (data) => {
      queryClient.setQueryData($api.queryOptions("get", "/me").queryKey, data);
      toast.success("Profile saved.");
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear to others on this server.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{user.username}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>
            <Badge variant="secondary">{user.role === "admin" ? "Admin" : "User"}</Badge>
          </dd>
        </dl>
        <form
          className="grid max-w-md gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ body: { display_name: formValues(event.currentTarget).display_name ?? "" } });
          }}
        >
          {update.error ? <ErrorAlert error={update.error} /> : null}
          <TextField
            label="Display name"
            name="display_name"
            defaultValue={user.display_name}
            maxLength={100}
            error={update.error}
            hint="Leave empty to show your username."
          />
          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
