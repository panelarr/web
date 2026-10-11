// SPDX-License-Identifier: GPL-3.0-or-later

import { onMockEvent } from "@/mocks/events";

/**
 * jsdom has no EventSource. This one receives the mock server's events directly, so tests
 * see live updates as the app would.
 */
export class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly withCredentials: boolean;
  private readonly off: () => void;

  constructor(
    readonly url: string,
    init?: EventSourceInit,
  ) {
    super();
    this.withCredentials = init?.withCredentials ?? false;
    this.off = onMockEvent((type, data) => {
      if (this.readyState === FakeEventSource.OPEN)
        this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
    });
    queueMicrotask(() => {
      if (this.readyState === FakeEventSource.CLOSED) return;
      this.readyState = FakeEventSource.OPEN;
      this.dispatchEvent(new MessageEvent("ready", { data: "{}" }));
    });
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.off();
  }
}
