// SPDX-License-Identifier: GPL-3.0-or-later

// The data of the server's events (GET /api/v1/events), as the server sends them. The spec
// describes the stream but not each event's data yet; these follow the server's code.
import type { components } from "./schema.gen";

type S = components["schemas"];

export interface JobEvent {
  job_id: string;
  run_id: string;
  /** job.progress */
  progress?: S["JobProgress"];
  /** job.done and job.failed */
  status?: S["JobRunStatus"];
}

export interface TaskEvent {
  id: string;
  kind: string;
  state: S["TaskState"];
  attempts: number;
  last_error?: string;
  progress?: S["JobProgress"];
}

export interface WorkEvent {
  work_id: string;
  /** chapters.new: how many */
  new?: number;
  /** chapter.downloaded, progress.synced */
  chapter_id?: string;
  page?: number;
  completed?: boolean;
}

export interface EventMap {
  "job.started": JobEvent;
  "job.progress": JobEvent;
  "job.done": JobEvent;
  "job.failed": JobEvent;
  "task.queued": TaskEvent;
  "task.started": TaskEvent;
  "task.progress": TaskEvent;
  "task.updated": TaskEvent;
  "work.updated": WorkEvent;
  "library.changed": WorkEvent;
  "chapters.new": WorkEvent;
  "chapter.downloaded": WorkEvent;
  "progress.synced": WorkEvent;
}

export type EventType = keyof EventMap;
