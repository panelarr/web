// SPDX-License-Identifier: GPL-3.0-or-later

// The metadata service's suspected duplicates and the decision model that rates them, as the
// server passes them on.
import type { components } from "@/api/schema.gen";
import { CATALOG, summary } from "./catalog";

type S = components["schemas"];

export interface DuplicatesState {
  duplicates: S["DuplicatePair"][];
  judge: S["DuplicateJudge"];
  /** The key the admin saved for the judge (never returned). */
  judgeKey: string | undefined;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const entry = (i: number) => {
  const found = CATALOG[i];
  if (!found) throw new Error(`no catalogue entry ${i}`);
  return summary(found, i);
};

function pair(
  id: number,
  a: number,
  b: number,
  score: number,
  signals: Partial<S["DuplicateSignals"]>,
  rest: Partial<S["DuplicatePair"]> = {},
): S["DuplicatePair"] {
  const entryA = entry(a);
  const entryB = entry(b);
  return {
    id,
    entry_a: entryA,
    entry_b: entryB,
    status: "open",
    score,
    signals: {
      title: 0.5,
      title_a: entryA.title,
      title_b: entryB.title,
      people: -1,
      shared_people: [],
      ...(entryA.year ? { year_a: entryA.year } : {}),
      ...(entryB.year ? { year_b: entryB.year } : {}),
      ...(entryA.type ? { type_a: entryA.type } : {}),
      ...(entryB.type ? { type_b: entryB.type } : {}),
      shared_ids: [],
      same_provider: false,
      ...signals,
    },
    created_at: hoursAgo(30),
    updated_at: hoursAgo(30),
    ...rest,
  };
}

export function initialDuplicates(): DuplicatesState {
  return {
    duplicates: [
      pair(
        1,
        0,
        12,
        0.94,
        { title: 0.97, people: 1, shared_people: ["Aoi Hanamura"], shared_ids: ["example-db:5521"] },
        {
          verdict: {
            judge: "model",
            model: "example-model-small",
            same: 0.96,
            choice: "same_work",
            probabilities: { same_work: 0.96, related_work: 0.03, different: 0.01 },
            confidence: 0.92,
            tokens: 812,
            at: hoursAgo(29),
          },
        },
      ),
      pair(
        2,
        1,
        13,
        0.81,
        { title: 0.88, people: 0.5, shared_people: ["Ren Takeda"], same_provider: true },
        {
          verdict: {
            judge: "model",
            model: "example-model-small",
            same: 0.22,
            choice: "related_work",
            probabilities: { same_work: 0.22, related_work: 0.71, different: 0.07 },
            confidence: 0.64,
            at: hoursAgo(28),
          },
        },
      ),
      pair(3, 2, 14, 0.72, { title: 0.76 }),
      pair(4, 3, 15, 0.66, { title: 0.7, people: 0 }),
      pair(
        5,
        4,
        16,
        0.9,
        { title: 0.93 },
        {
          status: "dismissed",
          decided_at: hoursAgo(5),
          decided_by: "admin",
          note: "A sequel, not the same work.",
        },
      ),
    ],
    judge: {
      enabled: false,
      kind: "openai-compatible",
      url: "http://models.local:8080/v1",
      model: "example-model-small",
      has_api_key: false,
      covers: false,
      origin: "config",
    },
    judgeKey: undefined,
  };
}

/** What the decision model says about a made-up pair, for its settings' test. */
export function judgeTest(settings: S["DuplicateJudgeSettings"]): S["DuplicateJudgeTest"] {
  if (!settings.url) return { ok: false, error: "No URL: where does the model answer?" };
  if (settings.api_key === "wrong") return { ok: false, error: "The model service answered 401 Unauthorized." };
  return {
    ok: true,
    verdict: {
      judge: "model",
      ...(settings.model ? { model: settings.model } : {}),
      same: 0.93,
      choice: "same_work",
      probabilities: { same_work: 0.93, related_work: 0.05, different: 0.02 },
      confidence: 0.88,
      tokens: 640,
      at: new Date().toISOString(),
    },
  };
}
