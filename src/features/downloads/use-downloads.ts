// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";

type Task = components["schemas"]["Task"];

/** May the user queue downloads? */
export function useCanDownload(): boolean {
  const { user } = useMe();
  return user.role === "admin" || user.grants.may_download;
}

/**
 * The user's open downloads (queued or running), by chapter: to mark chapter rows while they
 * download. Kept live by the event stream (progress patched in place).
 */
export function useOpenDownloads(enabled = true) {
  const list = $api.useQuery("get", "/downloads", { params: { query: { page_size: 200 } } }, { enabled });
  return useMemo(() => {
    const byChapter = new Map<string, Task>();
    for (const item of list.data?.items ?? []) {
      const chapterId = item.task.payload.chapter_id;
      if (typeof chapterId === "string" && (item.task.state === "queued" || item.task.state === "running")) {
        byChapter.set(chapterId, item.task);
      }
    }
    return byChapter;
  }, [list.data]);
}

/** "Downloading 40%" or "Queued". */
export function downloadLabel(task: Task): string {
  if (task.state === "running") {
    const p = task.progress;
    return p?.total ? `Downloading ${Math.round((p.done / p.total) * 100)}%` : "Downloading";
  }
  return "Queued";
}
