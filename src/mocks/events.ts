// SPDX-License-Identifier: GPL-3.0-or-later

import type { EventMap, EventType } from "@/api/event-types";

type Listener = (type: string, data: unknown) => void;

const listeners = new Set<Listener>();

/** Sends an event to every open mock event stream (the browser's, or a test's fake). */
export function emit<T extends EventType>(type: T, data: EventMap[T]): void {
  for (const listener of listeners) listener(type, data);
}

export function onMockEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
