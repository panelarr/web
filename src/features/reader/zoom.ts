// SPDX-License-Identifier: GPL-3.0-or-later

/** A zoomed view: scale around the centre of the viewport, then shift by (x, y) pixels. */
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const NO_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** How far a double tap zooms in. */
export const TAP_SCALE = 2.5;

/** Keeps the content covering the viewport: no panning past its edges. */
export function clampPan(state: ZoomState, content: Size, viewport: Size): ZoomState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale));
  const limitX = Math.max(0, (content.width * scale - viewport.width) / 2);
  const limitY = Math.max(0, (content.height * scale - viewport.height) / 2);
  return {
    scale,
    x: Math.min(limitX, Math.max(-limitX, state.x)),
    y: Math.min(limitY, Math.max(-limitY, state.y)),
  };
}

/**
 * Zooms by `factor` keeping the point under `focus` (viewport pixels from the top left) where
 * it is, the way pinch and Ctrl+wheel feel natural.
 */
export function zoomAt(
  state: ZoomState,
  factor: number,
  focus: { x: number; y: number },
  content: Size,
  viewport: Size,
): ZoomState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * factor));
  const ratio = scale / state.scale;
  // The focus point relative to the viewport's centre.
  const fx = focus.x - viewport.width / 2;
  const fy = focus.y - viewport.height / 2;
  const next = { scale, x: fx - (fx - state.x) * ratio, y: fy - (fy - state.y) * ratio };
  return clampPan(next, content, viewport);
}

/** A double tap: zoom into the tapped point, or back out when zoomed. */
export function toggleZoom(
  state: ZoomState,
  focus: { x: number; y: number },
  content: Size,
  viewport: Size,
): ZoomState {
  if (state.scale > 1.01) return NO_ZOOM;
  return zoomAt(state, TAP_SCALE, focus, content, viewport);
}
