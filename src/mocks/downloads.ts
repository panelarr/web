// SPDX-License-Identifier: GPL-3.0-or-later

// Downloads for the mock server: chapter downloads are tasks that move through the queue a
// step at a time, with progress events, ending with the chapter stored (once, for everyone).
import type { components } from "@/api/schema.gen";
import { emit } from "./events";
import { taskEvent } from "./jobs";

type S = components["schemas"];

export interface DownloadsState {
  tasks: S["Task"][];
  downloaded: string[];
  pausedKinds: string[];
  storages: S["StorageInfo"][];
}

export const KIND = "download.chapter";

export function initialStorages(): S["StorageInfo"][] {
  return [
    {
      id: "local",
      name: "Library disk",
      kind: "local",
      default: true,
      root: "/data/library",
      has_secret: false,
      files: 128,
    },
    {
      id: "archive",
      name: "Archive bucket",
      kind: "s3",
      default: false,
      endpoint: "https://s3.example.com",
      region: "eu-central-1",
      bucket: "panelarr-archive",
      prefix: "library/",
      path_style: false,
      access_key: "EXAMPLEKEY",
      has_secret: true,
      files: 0,
    },
  ];
}

/** Queues a chapter download, unless it is stored or queued already (by anyone). */
export function queueDownload(
  state: DownloadsState,
  chapter: { id: string; title: string; number?: number | undefined },
  work: { id: string; title: string },
  userId: string,
): "queued" | "downloaded" | "already" {
  if (state.downloaded.includes(chapter.id)) return "downloaded";
  const open = state.tasks.find(
    (t) => t.kind === KIND && t.payload.chapter_id === chapter.id && (t.state === "queued" || t.state === "running"),
  );
  if (open) return "already";
  const now = new Date().toISOString();
  const task: S["Task"] = {
    id: crypto.randomUUID(),
    kind: KIND,
    state: "queued",
    priority: 0,
    attempts: 0,
    max_attempts: 5,
    run_after: now,
    limit_key: "source:example:1001",
    payload: {
      chapter_id: chapter.id,
      work_id: work.id,
      work_title: work.title,
      chapter_title: chapter.title,
      ...(chapter.number !== undefined ? { chapter_number: chapter.number } : {}),
    },
    created_by: userId,
    created_at: now,
  };
  state.tasks.unshift(task);
  taskEvent("task.queued", task);
  return "queued";
}

const PAGES = 12;
const CONCURRENCY = 2;

/** Moves downloads on: starts queued ones up to the limit, adds pages, finishes them. */
export function tickDownloads(state: DownloadsState): boolean {
  if (state.pausedKinds.includes(KIND)) return false;
  let changed = false;
  for (const task of state.tasks.filter((t) => t.kind === KIND && t.state === "running" && t.payload.chapter_id)) {
    const done = (task.progress?.done ?? 0) + 4;
    changed = true;
    if (done >= PAGES) {
      task.state = "succeeded";
      task.finished_at = new Date().toISOString();
      delete task.progress;
      const chapterId = String(task.payload.chapter_id);
      if (!state.downloaded.includes(chapterId)) state.downloaded.push(chapterId);
      const storage = state.storages.find((s) => s.default);
      if (storage) storage.files += 1;
      taskEvent("task.updated", task);
      emit("chapter.downloaded", { work_id: String(task.payload.work_id), chapter_id: chapterId });
    } else {
      task.progress = { phase: "pages", done, total: PAGES, unit: "pages" };
      taskEvent("task.progress", task);
    }
  }
  const running = state.tasks.filter((t) => t.kind === KIND && t.state === "running").length;
  const waiting = state.tasks.filter((t) => t.kind === KIND && t.state === "queued" && t.payload.chapter_id).reverse();
  for (const task of waiting.slice(0, Math.max(0, CONCURRENCY - running))) {
    task.state = "running";
    task.attempts += 1;
    task.started_at = new Date().toISOString();
    task.progress = { phase: "pages", done: 0, total: PAGES, unit: "pages" };
    taskEvent("task.started", task);
    changed = true;
  }
  return changed;
}

/** A download as the downloads list shows it. */
export function downloadItem(task: S["Task"]): S["DownloadItem"] | undefined {
  const p = task.payload as Record<string, unknown>;
  if (typeof p.work_id !== "string" || typeof p.chapter_id !== "string") return undefined;
  return {
    task,
    work_id: p.work_id,
    chapter_id: p.chapter_id,
    work_title: String(p.work_title ?? ""),
    chapter_title: String(p.chapter_title ?? ""),
    ...(typeof p.chapter_number === "number" ? { chapter_number: p.chapter_number } : {}),
  };
}
