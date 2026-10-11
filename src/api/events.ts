// SPDX-License-Identifier: GPL-3.0-or-later

import type { Query, QueryClient } from "@tanstack/react-query";

/**
 * Which cached API paths each server event makes stale. Keys match an event type exactly or
 * by prefix ("job." matches "job.done"); values are path prefixes of the queries to refetch.
 */
export const INVALIDATIONS: ReadonlyArray<readonly [event: string, paths: readonly string[]]> = [
  ["job.", ["/jobs", "/job-runs"]],
  ["task.", ["/tasks", "/queue"]],
];

export type EventListener = (data: unknown, type: string) => void;

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 60_000;

function queryPath(query: Query): string | undefined {
  const path = query.queryKey[1];
  return typeof path === "string" ? path : undefined;
}

/**
 * The one connection to the server's event stream. Events turn into query invalidations, and
 * components may listen for the data itself (e.g. live progress). Events aren't replayed, so
 * after a reconnect every active query refetches.
 */
export class EventStream {
  private source: EventSource | undefined;
  private connectedBefore = false;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly registered = new Set<string>();

  constructor(
    private readonly queryClient: QueryClient,
    private readonly url: string = new URL("api/v1/events", document.baseURI).href,
  ) {}

  start(): void {
    if (this.source || typeof EventSource === "undefined") return;
    const source = new EventSource(this.url, { withCredentials: true });
    this.source = source;
    this.registered.clear();
    source.addEventListener("ready", () => this.onReady());
    for (const [event] of INVALIDATIONS) this.register(event);
    for (const type of this.listeners.keys()) this.register(type);
    source.onerror = () => {
      // The browser reconnects by itself unless the server refused the stream (an HTTP
      // error): then back off and try again.
      if (source.readyState === EventSource.CLOSED) this.scheduleRetry();
    };
  }

  stop(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.source?.close();
    this.source = undefined;
    this.connectedBefore = false;
    this.retryMs = MIN_RETRY_MS;
  }

  /** Calls `listener` for every event of `type`. Returns the unsubscribe function. */
  subscribe(type: string, listener: EventListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    this.register(type);
    return () => set.delete(listener);
  }

  /** Handles one event; public so tests and mocks can feed events without a stream. */
  dispatch(type: string, raw: string): void {
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Not JSON: hand over the text.
    }
    const prefixes = INVALIDATIONS.filter(([event]) => matches(type, event)).flatMap(([, paths]) => paths);
    if (prefixes.length > 0) {
      void this.queryClient.invalidateQueries({
        predicate: (query) => {
          const path = queryPath(query);
          return path !== undefined && prefixes.some((prefix) => path.startsWith(prefix));
        },
      });
    }
    for (const listener of this.listeners.get(type) ?? []) listener(data, type);
  }

  private onReady(): void {
    this.retryMs = MIN_RETRY_MS;
    if (this.connectedBefore) void this.queryClient.invalidateQueries({ type: "active" });
    this.connectedBefore = true;
  }

  private register(type: string): void {
    // EventSource has no wildcard, so prefixes ("job.") register when a concrete type is seen
    // in the table; prefix entries also need their concrete names, listed by the server.
    const names = type.endsWith(".") ? (KNOWN_EVENTS[type] ?? []) : [type];
    for (const name of names) {
      if (this.registered.has(name) || !this.source) continue;
      this.registered.add(name);
      this.source.addEventListener(name, (event) => this.dispatch(name, (event as MessageEvent<string>).data));
    }
  }

  private scheduleRetry(): void {
    this.source?.close();
    this.source = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }
}

/** The event names the server documents for each prefix in INVALIDATIONS. */
export const KNOWN_EVENTS: Record<string, readonly string[]> = {
  "job.": ["job.started", "job.progress", "job.done", "job.failed"],
  "task.": ["task.queued", "task.started", "task.progress", "task.updated"],
};

function matches(type: string, event: string): boolean {
  return event.endsWith(".") ? type.startsWith(event) : type === event;
}
