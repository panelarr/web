// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { IN_FLIGHT, PageLoader, type WantedPage } from "./page-loader";

/** Images that load when told to, recording what was asked for. */
function fakeImages() {
  const started: string[] = [];
  const pending = new Map<string, HTMLImageElement>();
  let most = 0;
  const create = () => {
    const image = { naturalWidth: 0, naturalHeight: 0 } as unknown as HTMLImageElement & { _src?: string };
    Object.defineProperty(image, "src", {
      set(url: string) {
        image._src = url;
        started.push(url);
        pending.set(url, image);
        most = Math.max(most, pending.size);
      },
      get: () => image._src ?? "",
    });
    image.removeAttribute = () => {
      if (image._src) pending.delete(image._src);
    };
    return image;
  };
  const finish = (url: string, ok = true) => {
    const image = pending.get(url);
    if (!image) throw new Error(`${url} isn't loading`);
    pending.delete(url);
    Object.assign(image, { naturalWidth: 800, naturalHeight: 1200 });
    if (ok) image.onload?.(new Event("load"));
    else image.onerror?.(new Event("error"));
  };
  return { create, started, finish, loading: () => [...pending.keys()], most: () => most };
}

const pages = (from: number, to: number): WantedPage[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ key: `c:${from + i}`, url: `/p/${from + i}` }));

describe("loading pages ahead", () => {
  it("loads every page asked for, in order, a few at a time", () => {
    const images = fakeImages();
    const done: string[] = [];
    const loader = new PageLoader((key) => done.push(key), IN_FLIGHT, images.create);
    // On screen: page 0; 8 to load ahead.
    loader.want(pages(0, 8));
    expect(images.loading()).toEqual(["/p/0", "/p/1", "/p/2"]);
    // Slow pages arrive in any order: the next one in line takes each freed slot.
    images.finish("/p/2");
    images.finish("/p/0");
    images.finish("/p/1");
    while (images.loading().length > 0) images.finish(images.loading()[0] as string);
    expect(images.started).toEqual(pages(0, 8).map((p) => p.url));
    expect(images.most()).toBe(IN_FLIGHT);
    expect(done).toHaveLength(9);
  });

  it("loads only what's wanted, and each page once", () => {
    const images = fakeImages();
    const loader = new PageLoader(() => {}, IN_FLIGHT, images.create);
    // Nothing to load ahead: only the pages on screen.
    loader.want(pages(0, 1));
    images.finish("/p/0");
    images.finish("/p/1");
    expect(images.loading()).toEqual([]);
    loader.want(pages(1, 3));
    expect(images.loading()).toEqual(["/p/2", "/p/3"]);
    expect(images.started).toEqual(["/p/0", "/p/1", "/p/2", "/p/3"]);
  });

  it("gives the slots to the pages wanted now when the reader goes elsewhere", () => {
    const images = fakeImages();
    const loader = new PageLoader(() => {}, IN_FLIGHT, images.create);
    loader.want(pages(0, 5));
    loader.want(pages(40, 45));
    expect(images.loading()).toEqual(["/p/40", "/p/41", "/p/42"]);
  });

  it("tells a page failed, without trying it again", () => {
    const images = fakeImages();
    const results: Array<[string, unknown]> = [];
    const loader = new PageLoader((key, size) => results.push([key, size]), IN_FLIGHT, images.create);
    loader.want(pages(0, 0));
    images.finish("/p/0", false);
    loader.want(pages(0, 1));
    expect(results).toEqual([["c:0", undefined]]);
    expect(images.loading()).toEqual(["/p/1"]);
    images.finish("/p/1");
    expect(results.at(-1)).toEqual(["c:1", { width: 800, height: 1200 }]);
  });
});
