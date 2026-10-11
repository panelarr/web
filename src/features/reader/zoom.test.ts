// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { clampPan, NO_ZOOM, toggleZoom, zoomAt } from "./zoom";

const viewport = { width: 400, height: 800 };
const content = { width: 400, height: 600 };

describe("zoom", () => {
  it("keeps the point under the fingers in place", () => {
    const zoomed = zoomAt(NO_ZOOM, 2, { x: 300, y: 400 }, content, viewport);
    expect(zoomed.scale).toBe(2);
    // The focus was 100 px right of the centre; at 2x it would move to 200 px, so shift back 100.
    expect(zoomed.x).toBe(-100);
    expect(zoomed.y).toBe(0);
  });

  it("never pans past the content's edges", () => {
    expect(clampPan({ scale: 2, x: 999, y: -999 }, content, viewport)).toEqual({ scale: 2, x: 200, y: -200 });
    // Content smaller than the viewport stays centred.
    expect(clampPan({ scale: 1, x: 50, y: 50 }, content, viewport)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("limits the scale", () => {
    expect(zoomAt(NO_ZOOM, 0.5, { x: 0, y: 0 }, content, viewport).scale).toBe(1);
    expect(zoomAt({ scale: 4, x: 0, y: 0 }, 3, { x: 200, y: 400 }, content, viewport).scale).toBe(5);
  });

  it("double tap zooms in to the point, and out again", () => {
    const zoomed = toggleZoom(NO_ZOOM, { x: 200, y: 400 }, content, viewport);
    expect(zoomed.scale).toBe(2.5);
    expect(toggleZoom(zoomed, { x: 10, y: 10 }, content, viewport)).toEqual(NO_ZOOM);
  });
});
