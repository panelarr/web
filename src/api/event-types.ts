// SPDX-License-Identifier: GPL-3.0-or-later

// The data of the server's events (GET /api/v1/events), as the spec describes it.
import type { components } from "./schema.gen";

type S = components["schemas"];

export type JobEvent = S["JobEvent"];
export type PluginEvent = S["PluginEvent"];
export type TaskEvent = S["TaskEvent"];
export type WorkEvent = S["WorkEvent"];

export interface EventMap {
  "job.started": JobEvent;
  "job.progress": JobEvent;
  "job.done": JobEvent;
  "job.failed": JobEvent;
  "task.queued": TaskEvent;
  "task.started": TaskEvent;
  "task.progress": TaskEvent;
  "task.updated": TaskEvent;
  "plugin.health": PluginEvent;
  "work.updated": WorkEvent;
  "library.changed": WorkEvent;
  "chapters.new": WorkEvent;
  "chapter.downloaded": WorkEvent;
  "progress.synced": WorkEvent;
}

export type EventType = keyof EventMap;
