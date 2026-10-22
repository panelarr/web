// SPDX-License-Identifier: GPL-3.0-or-later

type Size = { width: number; height: number };

/** A page to load: its key in the strip and its image's address. */
export type WantedPage = { key: string; url: string };

/** At most this many page images load at once (the server fetches two per source at a time). */
export const IN_FLIGHT = 3;

/**
 * Loads a long strip's page images into the browser, whether or not they're on screen yet: in the
 * order asked for and a few at a time, so the next page comes first even when the source paces
 * its requests. A page's own image then shows from what was loaded here, at once, and its size is
 * known before it's on screen. Each page is loaded once (a failed one is tried again from the page).
 */
export class PageLoader {
  private wanted: WantedPage[] = [];
  private readonly loading = new Map<string, HTMLImageElement>();
  /** Loaded ones still wanted: the browser reuses an image a document still holds. */
  private readonly kept = new Map<string, HTMLImageElement>();
  private readonly done = new Set<string>();

  constructor(
    /** A page loaded (with its natural size) or failed (without). */
    private readonly onDone: (key: string, size: Size | undefined) => void,
    private readonly inFlight = IN_FLIGHT,
    private readonly createImage: () => HTMLImageElement = () => new Image(),
  ) {}

  /** The pages wanted now, in the order to load them. */
  want(pages: WantedPage[]): void {
    this.wanted = pages;
    const keys = new Set(pages.map((page) => page.key));
    // The reader went elsewhere: the slots go to the pages wanted now.
    for (const [key, image] of this.loading) if (!keys.has(key)) this.cancel(key, image);
    for (const key of this.kept.keys()) if (!keys.has(key)) this.kept.delete(key);
    this.pump();
  }

  /** Stops what's still loading. */
  dispose(): void {
    for (const [key, image] of this.loading) this.cancel(key, image);
    this.kept.clear();
    this.wanted = [];
  }

  private cancel(key: string, image: HTMLImageElement) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    this.loading.delete(key);
  }

  private pump() {
    for (const page of this.wanted) {
      if (this.loading.size >= this.inFlight) return;
      if (!this.done.has(page.key) && !this.loading.has(page.key)) this.start(page);
    }
  }

  private start({ key, url }: WantedPage) {
    const image = this.createImage();
    const settle = (size: Size | undefined) => {
      if (this.loading.get(key) !== image) return;
      this.loading.delete(key);
      this.done.add(key);
      if (size && this.wanted.some((page) => page.key === key)) this.kept.set(key, image);
      this.onDone(key, size);
      this.pump();
    };
    image.decoding = "async";
    image.onload = () => settle({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => settle(undefined);
    this.loading.set(key, image);
    image.src = url;
  }
}
