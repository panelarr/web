// SPDX-License-Identifier: GPL-3.0-or-later

import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

/**
 * Registers the service worker that caches the app shell (never API data). When a new
 * version is ready, it asks before reloading, so nobody loses their place mid-chapter.
 */
export function registerServiceWorker(): void {
  const update = registerSW({
    onNeedRefresh() {
      toast("A new version of Panelarr is ready.", {
        duration: Number.POSITIVE_INFINITY,
        action: { label: "Reload", onClick: () => void update(true) },
      });
    },
  });
}
