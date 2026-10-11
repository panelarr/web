// SPDX-License-Identifier: GPL-3.0-or-later

// A source's search filters, in the source plugin contract's JSON form (the server passes
// them on as the plugin gives them). Filter values are sent back by position: [index] for a
// top-level filter, [group index, child index] inside a group.

export type TriState = "TRI_STATE_IGNORE" | "TRI_STATE_INCLUDE" | "TRI_STATE_EXCLUDE";

export interface SourceFilter {
  name: string;
  header?: object;
  separator?: object;
  text?: { value?: string };
  checkbox?: { value?: boolean };
  triState?: { value?: TriState | "TRI_STATE_UNSPECIFIED" };
  tri_state?: { value?: TriState | "TRI_STATE_UNSPECIFIED" };
  select?: { options?: string[]; selected?: number };
  sort?: { options?: string[]; selection?: { index?: number; ascending?: boolean } };
  group?: { filters?: SourceFilter[] };
}

export type FilterValue =
  | { kind: "text"; value: string }
  | { kind: "checkbox"; value: boolean }
  | { kind: "triState"; value: TriState }
  | { kind: "select"; value: number }
  | { kind: "sort"; value: { index: number; ascending: boolean } | undefined };

/** Filter values by position ("3", or "6.1" inside a group). */
export type FilterState = Record<string, FilterValue>;

const tri = (value: string | undefined): TriState =>
  value === "TRI_STATE_INCLUDE" || value === "TRI_STATE_EXCLUDE" ? value : "TRI_STATE_IGNORE";

/** A filter's kind and the value it starts with; undefined for labels and dividers. */
export function initialValue(filter: SourceFilter): FilterValue | undefined {
  if (filter.text) return { kind: "text", value: filter.text.value ?? "" };
  if (filter.checkbox) return { kind: "checkbox", value: filter.checkbox.value ?? false };
  const triState = filter.triState ?? filter.tri_state;
  if (triState) return { kind: "triState", value: tri(triState.value) };
  if (filter.select) return { kind: "select", value: filter.select.selected ?? 0 };
  if (filter.sort) {
    const s = filter.sort.selection;
    return { kind: "sort", value: s ? { index: s.index ?? 0, ascending: s.ascending ?? false } : undefined };
  }
  return undefined;
}

/** Every filter's starting value, by position. */
export function initialState(filters: SourceFilter[]): FilterState {
  const state: FilterState = {};
  filters.forEach((filter, i) => {
    const value = initialValue(filter);
    if (value) state[String(i)] = value;
    filter.group?.filters?.forEach((child, j) => {
      const childValue = initialValue(child);
      if (childValue) state[`${i}.${j}`] = childValue;
    });
  });
  return state;
}

/** The values that differ from the filters' own defaults, in the contract's JSON form. */
export function filterValues(filters: SourceFilter[], state: FilterState): Array<Record<string, unknown>> {
  const defaults = initialState(filters);
  const out: Array<Record<string, unknown>> = [];
  for (const [position, value] of Object.entries(state)) {
    if (JSON.stringify(defaults[position]) === JSON.stringify(value)) continue;
    const path = position.split(".").map(Number);
    if (value.kind === "sort") {
      if (value.value) out.push({ path, sort: value.value });
    } else {
      out.push({ path, [value.kind]: value.value });
    }
  }
  return out.sort((a, b) => String(a.path).localeCompare(String(b.path), undefined, { numeric: true }));
}

/** How many filters differ from their defaults. */
export function changedCount(filters: SourceFilter[], state: FilterState): number {
  return filterValues(filters, state).length;
}
