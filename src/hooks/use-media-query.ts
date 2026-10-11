// SPDX-License-Identifier: GPL-3.0-or-later

import { useSyncExternalStore } from "react";

/** Whether a media query matches now, updated as it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** The `md` breakpoint and up: the desktop layout. */
export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
