// SPDX-License-Identifier: GPL-3.0-or-later

import type { TapZones } from "./settings";

export type TapAction = "prev" | "next" | "menu";

/**
 * What a tap at (x, y) does, with x and y from 0 to 1 across the screen. Layouts are written
 * for left-to-right reading; right-to-left reading (and "invert") swaps previous and next.
 *
 * - edge: left third back, right third forward, the middle the menu
 * - kindle: a narrow left strip back, the top middle the menu, everything else forward
 * - lshape: the top and left edges back, the bottom and right edges forward, the centre the menu
 * - sides: left half back, right half forward, a middle strip the menu
 * - off: every tap opens the menu
 */
export function tapAction(layout: TapZones, x: number, y: number, flip: boolean): TapAction {
  const action = ((): TapAction => {
    switch (layout) {
      case "edge":
        return x < 1 / 3 ? "prev" : x > 2 / 3 ? "next" : "menu";
      case "kindle":
        if (x < 0.3) return "prev";
        if (y < 0.2 && x < 0.7) return "menu";
        return "next";
      case "lshape": {
        const centre = x > 1 / 3 && x < 2 / 3 && y > 1 / 3 && y < 2 / 3;
        if (centre) return "menu";
        if ((x < 1 / 3 && y < 2 / 3) || (y < 1 / 3 && x < 2 / 3)) return "prev";
        return "next";
      }
      case "sides":
        return x < 0.4 ? "prev" : x > 0.6 ? "next" : "menu";
      default:
        return "menu";
    }
  })();
  if (!flip || action === "menu") return action;
  return action === "prev" ? "next" : "prev";
}
