// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";

/** Bookmarks a work's chapters, or removes them: one or many at once. They're the user's own. */
export function useBookmarks(workId: string) {
  const queryClient = useQueryClient();
  const set = $api.useMutation("post", "/works/{work_id}/bookmarks", {
    onSuccess: () =>
      void queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[1] === "/works/{work_id}/chapters" ||
          q.queryKey[1] === "/works/{work_id}/chapters/{chapter_id}" ||
          q.queryKey[1] === "/works/{work_id}/bookmarks" ||
          q.queryKey[1] === "/library",
      }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return {
    set: (chapterIds: string[], bookmarked: boolean, onDone?: () => void) => {
      if (chapterIds.length === 0) return;
      set.mutate(
        { params: { path: { work_id: workId } }, body: { chapter_ids: chapterIds, bookmarked } },
        onDone ? { onSuccess: onDone } : undefined,
      );
    },
    pending: set.isPending,
  };
}
