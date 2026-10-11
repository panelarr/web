// SPDX-License-Identifier: GPL-3.0-or-later

import { useSyncExternalStore } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser offers installing once, early: keep the offer for when the user asks.
let offer: InstallEvent | undefined;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    offer = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    offer = undefined;
    notify();
  });
}

function standalone(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

/**
 * Installing Panelarr as an app: a button where the browser offers it, and instructions on
 * iOS (where it's Share → Add to Home Screen). Nothing once installed.
 */
export function useInstall() {
  const available = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => offer !== undefined,
    () => false,
  );
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone();
  return {
    installed: standalone(),
    canPrompt: available,
    ios,
    install: async () => {
      if (!offer) return;
      await offer.prompt();
      await offer.userChoice;
      offer = undefined;
      notify();
    },
  };
}
