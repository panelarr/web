// SPDX-License-Identifier: GPL-3.0-or-later

import type { components } from "@/api/schema.gen";

export type Grants = components["schemas"]["Grants"];
export type ContentRating = components["schemas"]["ContentRating"];
export type Role = components["schemas"]["Role"];

/** Content ratings from mildest to strongest; a ceiling shows everything up to it. */
export const CONTENT_RATINGS: ReadonlyArray<{ id: ContentRating; label: string }> = [
  { id: "safe", label: "Safe" },
  { id: "suggestive", label: "Suggestive" },
  { id: "erotic", label: "Erotic" },
  { id: "pornographic", label: "Pornographic (everything)" },
];

/** What a new user or invite may do unless the admin changes it. */
export const DEFAULT_GRANTS: Grants = {
  may_add: true,
  may_download: false,
  may_manage_matches: false,
  content_rating_ceiling: "suggestive",
  all_sources: true,
  allowed_sources: [],
};

export function ratingLabel(rating: ContentRating): string {
  return CONTENT_RATINGS.find((r) => r.id === rating)?.label ?? rating;
}

/** Only what changed, for PATCH requests. */
export function grantsPatch(before: Grants, after: Grants): Partial<Grants> {
  const patch: Partial<Grants> = {};
  for (const key of Object.keys(after) as (keyof Grants)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      (patch as Record<string, unknown>)[key] = after[key];
    }
  }
  return patch;
}
