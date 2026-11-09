// SPDX-License-Identifier: GPL-3.0-or-later

import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type AnchorHTMLAttributes, type MouseEvent, useCallback } from "react";

/**
 * What the reader keeps in the history entry it is on. Every way into a chapter from a series
 * page says so (`fromWork`), and moving between chapters in the reader carries it over: the
 * reader replaces its own entry, so the entry below it is still that series page.
 */
export interface ReaderState {
  /** The series page the reader was opened from, one entry back. */
  fromWork?: string;
  /** Scrolling on into another chapter in a long strip: the same reader stays. */
  continuing?: boolean;
}

export function readerState(state: unknown): ReaderState {
  const { fromWork, continuing } = (state ?? {}) as ReaderState;
  return {
    ...(typeof fromWork === "string" ? { fromWork } : {}),
    ...(continuing === true ? { continuing } : {}),
  };
}

/** The state a link into the reader from a series page sets. */
export function openedFrom(workId: string): ReaderState {
  return { fromWork: workId };
}

/**
 * Leaves the reader for the series page without stacking a new entry: back to that page when the
 * reader was opened from it, else the series page replaces the reader. Back from there then goes
 * where the user came from, never into the reader again.
 */
export function useLeaveReader(workId: string): () => void {
  const router = useRouter();
  const fromWork = useRouterState({ select: (state) => readerState(state.location.state).fromWork });
  return useCallback(() => {
    if (fromWork === workId && router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: "/works/$workId", params: { workId }, replace: true });
  }, [router, fromWork, workId]);
}

/**
 * A link out of the reader to its series page. It keeps the address (open in a new tab works),
 * but a plain click leaves the reader as `useLeaveReader` does.
 */
export function LeaveReaderLink({
  workId,
  onClick,
  ...props
}: { workId: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const leave = useLeaveReader(workId);
  return (
    <Link
      {...props}
      to="/works/$workId"
      params={{ workId }}
      replace
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        leave();
      }}
    />
  );
}
