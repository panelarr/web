// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { FILTERS } from "@/mocks/sources";
import { filterValues, initialState, type SourceFilter } from "./filters";

const filters = FILTERS.filters as unknown as SourceFilter[];

describe("source filters", () => {
  it("start from each filter's own value, by position", () => {
    expect(initialState(filters)).toEqual({
      "1": { kind: "text", value: "" },
      "2": { kind: "select", value: 0 },
      "3": { kind: "sort", value: { index: 0, ascending: false } },
      "5": { kind: "checkbox", value: false },
      "6.0": { kind: "triState", value: "TRI_STATE_IGNORE" },
      "6.1": { kind: "triState", value: "TRI_STATE_IGNORE" },
      "6.2": { kind: "triState", value: "TRI_STATE_EXCLUDE" },
    });
  });

  it("send only what changed, in the contract's form", () => {
    const state = initialState(filters);
    expect(filterValues(filters, state)).toEqual([]);
    state["1"] = { kind: "text", value: "Aoi" };
    state["2"] = { kind: "select", value: 2 };
    state["3"] = { kind: "sort", value: { index: 2, ascending: true } };
    state["6.0"] = { kind: "triState", value: "TRI_STATE_INCLUDE" };
    state["6.2"] = { kind: "triState", value: "TRI_STATE_IGNORE" };
    expect(filterValues(filters, state)).toEqual([
      { path: [1], text: "Aoi" },
      { path: [2], select: 2 },
      { path: [3], sort: { index: 2, ascending: true } },
      { path: [6, 0], triState: "TRI_STATE_INCLUDE" },
      { path: [6, 2], triState: "TRI_STATE_IGNORE" },
    ]);
  });

  it("read snake_case tri-states too", () => {
    expect(initialState([{ name: "x", tri_state: { value: "TRI_STATE_INCLUDE" } }])).toEqual({
      "0": { kind: "triState", value: "TRI_STATE_INCLUDE" },
    });
  });
});
