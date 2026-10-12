// SPDX-License-Identifier: GPL-3.0-or-later

import type { Query, QueryClient } from "@tanstack/react-query";
import type { EventMap, EventType, TaskEvent } from "./event-types";

/**
 * Which cached queries each server event makes stale: API path prefixes (the second part of
 * an openapi-react-query key) or other query keys' first part.
 */
export const INVALIDATIONS: Partial<Record<EventType, readonly string[]>> = {
  "job.started": ["/jobs", "/job-runs"],
  "job.done": ["/jobs", "/job-runs"],
  "job.failed": ["/jobs", "/job-runs"],
  "task.queued": ["/tasks", "/queue", "/downloads"],
  "task.started": ["/tasks", "/queue", "/downloads"],
  "task.updated": ["/tasks", "/queue", "/downloads"],
  "work.updated": ["/works", "/library", "library-index"],
  "library.changed": ["/library", "library-index", "/catalog"],
  "chapters.new": ["/works", "/library"],
  "chapter.downloaded": ["/works", "/downloads", "/chapters"],
  "progress.synced": ["/works", "/me/history", "/chapters"],
};

/**
 * Events applied to cached data in place instead of refetching: progress arrives many times
 * a second, and refetching lists that often would swamp the server.
 */
export const PATCHES: Partial<Record<EventType, (client: QueryClient, data: never) => void>> = {
  "task.progress": (client, task: TaskEvent) => {
    const patch = <T extends { id: string }>(item: T): T =>
      item.id === task.id ? { ...item, state: task.state, attempts: task.attempts, progress: task.progress } : item;
    client.setQueriesData<TaskPage | Paged<TaskPage>>({ predicate: (q) => keyPath(q) === "/tasks" }, (old) =>
      mapPages(old, (page) => (page.tasks ? { ...page, tasks: page.tasks.map(patch) } : page)),
    );
    client.setQueriesData<{ id: string }>({ predicate: (q) => keyPath(q) === "/tasks/{task_id}" }, (old) =>
      old?.id === task.id ? patch(old) : old,
    );
    // Downloads are tasks too: { items: [{ task }] }.
    client.setQueriesData<DownloadPage | Paged<DownloadPage>>(
      { predicate: (q) => keyPath(q) === "/downloads" },
      (old) =>
        mapPages(old, (page) =>
          page.items ? { ...page, items: page.items.map((item) => ({ ...item, task: patch(item.task) })) } : page,
        ),
    );
  },
};

interface DownloadPage {
  items?: Array<{ task: { id: string } }>;
}
interface TaskPage {
  tasks?: Array<{ id: string }>;
}
interface Paged<T> {
  pages: T[];
  pageParams: unknown[];
}

/** Applies `fn` to a list response, or to every page of an infinite one. */
function mapPages<T extends object>(old: T | Paged<T> | undefined, fn: (page: T) => T): T | Paged<T> | undefined {
  if (!old) return old;
  if ("pages" in old && Array.isArray(old.pages)) return { ...old, pages: old.pages.map(fn) };
  return fn(old as T);
}

export type EventListener<T extends EventType> = (data: EventMap[T], type: T) => void;

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 60_000;
/** Invalidations are batched: a burst of events refetches once. */
const BATCH_MS = 500;

function keyPath(query: Query): string | undefined {
  const [first, second] = query.queryKey;
  return typeof second === "string" ? second : typeof first === "string" ? first : undefined;
}

/**
 * The one connection to the server's event stream. Events invalidate or patch cached
 * queries, and components can listen for an event's data (e.g. live progress). The server
 * doesn't replay events, so after a reconnect every active query refetches.
 */
export class EventStream {
  private source: EventSource | undefined;
  private connectedBefore = false;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private batchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Set<string>();
  private readonly listeners = new Map<string, Set<EventListener<EventType>>>();
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
    const types = new Set<string>([...Object.keys(INVALIDATIONS), ...Object.keys(PATCHES), ...this.listeners.keys()]);
    for (const type of types) this.register(type);
    source.onerror = () => {
      // The browser reconnects by itself unless the server refused the stream (an HTTP
      // error, e.g. signed out): then back off and try again.
      if (source.readyState === EventSource.CLOSED) this.scheduleRetry();
    };
  }

  stop(): void {
    clearTimeout(this.retryTimer);
    clearTimeout(this.batchTimer);
    this.retryTimer = undefined;
    this.batchTimer = undefined;
    this.pending.clear();
    this.source?.close();
    this.source = undefined;
    this.connectedBefore = false;
    this.retryMs = MIN_RETRY_MS;
  }

  /** Calls `listener` for every event of `type`. Returns the unsubscribe function. */
  subscribe<T extends EventType>(type: T, listener: EventListener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as EventListener<EventType>);
    this.register(type);
    return () => set.delete(listener as EventListener<EventType>);
  }

  /** Handles one event; public so tests can feed events without a stream. */
  dispatch(type: string, raw: string): void {
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Not JSON: hand over the text.
    }
    PATCHES[type as EventType]?.(this.queryClient, data as never);
    for (const prefix of INVALIDATIONS[type as EventType] ?? []) this.pending.add(prefix);
    if (this.pending.size > 0 && this.batchTimer === undefined) {
      this.batchTimer = setTimeout(() => this.flush(), BATCH_MS);
    }
    for (const listener of this.listeners.get(type) ?? []) listener(data as never, type as EventType);
  }

  /** Runs the batched invalidations now. */
  flush(): void {
    clearTimeout(this.batchTimer);
    this.batchTimer = undefined;
    const prefixes = [...this.pending];
    this.pending.clear();
    if (prefixes.length === 0) return;
    void this.queryClient.invalidateQueries({
      predicate: (query) => {
        const path = keyPath(query);
        return path !== undefined && prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      },
    });
  }

  private onReady(): void {
    this.retryMs = MIN_RETRY_MS;
    if (this.connectedBefore) void this.queryClient.invalidateQueries({ type: "active" });
    this.connectedBefore = true;
  }

  private register(type: string): void {
    if (this.registered.has(type) || !this.source) return;
    this.registered.add(type);
    this.source.addEventListener(type, (event) => this.dispatch(type, (event as MessageEvent<string>).data));
  }

  private scheduleRetry(): void {
    this.source?.close();
    this.source = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }
}
