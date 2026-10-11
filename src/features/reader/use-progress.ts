// SPDX-License-Identifier: GPL-3.0-or-later

import { useThrottledCallback } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@/api/client";

/**
 * Saves where the reader is, at most every few seconds while reading, and right away when
 * the page is hidden or the reader closes. The last page marks the chapter read (server).
 */
export function useProgressSaver(chapterId: string, pages: number) {
  const queryClient = useQueryClient();
  const pending = useRef<number | undefined>(undefined);
  const saved = useRef<number | undefined>(undefined);

  const send = (page: number, keepalive = false) => {
    if (saved.current === page || pages === 0) return;
    saved.current = page;
    pending.current = undefined;
    void api
      .PUT("/chapters/{chapter_id}/progress", {
        params: { path: { chapter_id: chapterId } },
        body: { page, pages },
        keepalive,
      })
      .then(() =>
        queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[1] === "/works/{work_id}/progress" || q.queryKey[1] === "/me/history",
        }),
      )
      .catch(() => {
        // Not saved (offline?): try again with the next page turn.
        saved.current = undefined;
      });
  };
  const throttled = useThrottledCallback((page: number) => send(page), { wait: 2000 });

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const flush = () => {
      if (pending.current !== undefined) sendRef.current(pending.current, true);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return (page: number, now = false) => {
    pending.current = page;
    if (now) send(page);
    else throttled(page);
  };
}
