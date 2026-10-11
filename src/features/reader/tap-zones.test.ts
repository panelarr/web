// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { tapAction } from "./tap-zones";

describe("tap zones", () => {
  it("edge: thirds", () => {
    expect(tapAction("edge", 0.1, 0.5, false)).toBe("prev");
    expect(tapAction("edge", 0.5, 0.5, false)).toBe("menu");
    expect(tapAction("edge", 0.9, 0.5, false)).toBe("next");
  });

  it("right-to-left reading swaps back and forward, never the menu", () => {
    expect(tapAction("edge", 0.1, 0.5, true)).toBe("next");
    expect(tapAction("edge", 0.9, 0.5, true)).toBe("prev");
    expect(tapAction("edge", 0.5, 0.5, true)).toBe("menu");
  });

  it("kindle: a left strip back, the top middle the menu, the rest forward", () => {
    expect(tapAction("kindle", 0.2, 0.9, false)).toBe("prev");
    expect(tapAction("kindle", 0.5, 0.1, false)).toBe("menu");
    expect(tapAction("kindle", 0.5, 0.6, false)).toBe("next");
  });

  it("lshape: top and left back, bottom and right forward, centre menu", () => {
    expect(tapAction("lshape", 0.5, 0.1, false)).toBe("prev");
    expect(tapAction("lshape", 0.1, 0.5, false)).toBe("prev");
    expect(tapAction("lshape", 0.5, 0.5, false)).toBe("menu");
    expect(tapAction("lshape", 0.9, 0.5, false)).toBe("next");
    expect(tapAction("lshape", 0.5, 0.9, false)).toBe("next");
  });

  it("off: always the menu", () => {
    expect(tapAction("off", 0.05, 0.05, false)).toBe("menu");
  });
});
