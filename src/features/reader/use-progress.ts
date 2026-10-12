// SPDX-License-Identifier: GPL-3.0-or-later

import { useThrottledCallback } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@/api/client";

interface Spot {
  chapterId: string;
  pages: number;
  page: number;
}

/**
 * Saves where the reader is, at most every few seconds while reading, and right away when
 * the page is hidden or the reader closes. The last page marks the chapter read (server).
 * The chapter can change while the reader stays open (a long strip reads on into the next
 * one): each save carries its own chapter, and the one left behind is saved before switching.
 */
export function useProgressSaver(chapterId: string, pages: number) {
  const queryClient = useQueryClient();
  const pending = useRef<Spot | undefined>(undefined);
  const saved = useRef<string | undefined>(undefined);

  const send = (spot: Spot, keepalive = false) => {
    const key = `${spot.chapterId}:${spot.page}`;
    if (saved.current === key || spot.pages === 0) return;
    saved.current = key;
    if (pending.current === spot) pending.current = undefined;
    void api
      .PUT("/chapters/{chapter_id}/progress", {
        params: { path: { chapter_id: spot.chapterId } },
        body: { page: spot.page, pages: spot.pages },
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
  const throttled = useThrottledCallback((spot: Spot) => send(spot), { wait: 2000 });

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const flush = () => {
      if (pending.current) sendRef.current(pending.current, true);
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

  // Moving on to another chapter: what's waiting for the one left behind is saved now.
  useEffect(() => {
    if (pending.current && pending.current.chapterId !== chapterId) sendRef.current(pending.current);
  }, [chapterId]);

  return (page: number, now = false) => {
    const spot: Spot = { chapterId, pages, page };
    pending.current = spot;
    if (now) send(spot);
    else throttled(spot);
  };
}
