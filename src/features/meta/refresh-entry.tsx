// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { useIsAdmin } from "@/auth/session";
import { Button } from "@/components/ui/button";

/** For admins: asks the metadata service for fresh data on this entry from its providers now. */
export function RefreshEntryButton({ entryId }: { entryId: string }) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const refresh = $api.useMutation("post", "/system/meta/entries/{entry_id}/refresh", {
    onSuccess: ({ refreshed, failed }) => {
      void queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[1] === "string" && q.queryKey[1].startsWith("/catalog"),
      });
      const failures = Object.entries(failed);
      const from = refreshed.length > 0 ? `Fresh data from ${refreshed.join(", ")}.` : "No provider had fresh data.";
      const text =
        failures.length > 0 ? `${from} Failed: ${failures.map(([p, why]) => `${p} (${why})`).join(", ")}.` : from;
      (failures.length > 0 ? toast.warning : toast.success)(text);
    },
    onError: (error) => toast.error(`Not refreshed: ${errorMessage(error)}`),
  });
  if (!isAdmin) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={refresh.isPending}
      onClick={() => refresh.mutate({ params: { path: { entry_id: entryId } } })}
    >
      <RefreshCw className={refresh.isPending ? "animate-spin" : undefined} aria-hidden />
      Refresh from providers
    </Button>
  );
}
