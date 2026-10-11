// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { EventType } from "./event-types";
import { type EventListener, EventStream } from "./events";

const EventsContext = createContext<EventStream | undefined>(undefined);

/** Keeps the event stream open while the user is signed in (mounted in the app shell). */
export function EventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [stream] = useState(() => new EventStream(queryClient));
  useEffect(() => {
    stream.start();
    return () => stream.stop();
  }, [stream]);
  return <EventsContext.Provider value={stream}>{children}</EventsContext.Provider>;
}

export function useEventStream(): EventStream | undefined {
  return useContext(EventsContext);
}

/** Calls `listener` for each event of `type` while the component is mounted. */
export function useEvent<T extends EventType>(type: T, listener: EventListener<T>): void {
  const stream = useEventStream();
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => stream?.subscribe(type, (data, t) => latest.current(data, t)), [stream, type]);
}
