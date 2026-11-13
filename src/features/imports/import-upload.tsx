// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileUp, Loader2 } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { ApiError, errorMessage } from "@/api/errors";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, type Import, importQuery, importsQuery, MAX_BACKUP_BYTES } from "./imports";

type Upload =
  | { kind: "idle" }
  | { kind: "uploading"; file: File }
  | { kind: "failed"; file: File; error: unknown; retryAt?: number };

/** Sends the backup as the multipart field `file`; resolves to the import and whether it's new. */
async function uploadBackup(file: File): Promise<{ created: Import; earlier: boolean }> {
  const { data, response } = await api.POST("/me/imports", {
    body: { file: "" },
    bodySerializer: () => {
      const form = new FormData();
      form.append("file", file, file.name);
      return form;
    },
  });
  if (!data) throw new Error("The server answered without data.");
  return { created: data, earlier: response.status === 200 };
}

/** Seconds left until `at`, updated every second while it's in the future. */
function useSecondsUntil(at: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [at]);
  return at === undefined ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Where a backup is dropped or picked. The server reads it at once and answers with a new
 * import (or the earlier one for the same file), which opens its preview.
 */
export function ImportUpload({ running }: { running: Import | undefined }) {
  const [upload, setUpload] = useState<Upload>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const send = async (file: File) => {
    // The server says the same; checking first saves sending 64 MiB for nothing.
    if (file.size > MAX_BACKUP_BYTES) {
      setUpload({
        kind: "failed",
        file,
        error: new ApiError({ status: 413, code: "too_large", title: "That's too large" }),
      });
      return;
    }
    setUpload({ kind: "uploading", file });
    try {
      const { created, earlier } = await uploadBackup(file);
      queryClient.setQueryData(importQuery(created.id).queryKey, created);
      void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey });
      setUpload({ kind: "idle" });
      if (earlier) toast.info("You imported this file before: here is that import.");
      await navigate({ to: "/settings/imports/$importId", params: { importId: created.id } });
    } catch (error) {
      if (error instanceof ApiError && error.code === "import_running") {
        void queryClient.invalidateQueries({ queryKey: importsQuery().queryKey });
      }
      const retryAt =
        error instanceof ApiError && error.code === "busy" ? Date.now() + (error.retryAfter ?? 5) * 1000 : undefined;
      setUpload({ kind: "failed", file, error, ...(retryAt !== undefined ? { retryAt } : {}) });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && upload.kind !== "uploading") void send(file);
  };

  const uploading = upload.kind === "uploading";
  return (
    <div className="grid grid-cols-1 gap-3">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is a shortcut; the button does the same */}
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
        )}
        {uploading ? (
          <p role="status" className="text-sm [overflow-wrap:anywhere]">
            Uploading {upload.file.name} ({formatBytes(upload.file.size)})…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Drop a backup file here, or</p>
        )}
        {/* No `accept`: phones grey out files whose type they don't know, and backups have their own extension. */}
        <input
          ref={input}
          id={inputId}
          type="file"
          className="sr-only"
          aria-label="Backup file"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <Button type="button" disabled={uploading} onClick={() => input.current?.click()}>
          Choose a backup file
        </Button>
        <p className="text-xs text-muted-foreground">A .tachibk file, at most 64 MiB.</p>
      </div>
      {upload.kind === "failed" ? (
        <UploadError
          error={upload.error}
          retryAt={upload.retryAt}
          running={running}
          onRetry={() => void send(upload.file)}
        />
      ) : null}
    </div>
  );
}

function UploadError({
  error,
  retryAt,
  running,
  onRetry,
}: {
  error: unknown;
  retryAt: number | undefined;
  running: Import | undefined;
  onRetry: () => void;
}) {
  const seconds = useSecondsUntil(retryAt);
  const code = error instanceof ApiError ? error.code : undefined;
  switch (code) {
    case "bad_backup":
      return (
        <Alert variant="destructive">
          <AlertTitle>That file isn't a backup Panelarr can read</AlertTitle>
          <AlertDescription>
            <p className="[overflow-wrap:anywhere]">{errorMessage(error)}</p>
            <p>Make a new backup in Suwayomi or Mihon and upload that file as it is.</p>
          </AlertDescription>
        </Alert>
      );
    case "too_large":
      return (
        <Alert variant="destructive">
          <AlertTitle>The file is too large</AlertTitle>
          <AlertDescription>A backup can be at most 64 MiB.</AlertDescription>
        </Alert>
      );
    case "busy":
      return (
        <Alert>
          <AlertTitle>The server is busy</AlertTitle>
          <AlertDescription>
            <p role="status">
              {seconds > 0
                ? `It is reading another backup. Try again in ${seconds} s.`
                : "It was reading another backup. Try again now."}
            </p>
            <Button variant="outline" size="sm" className="mt-2" disabled={seconds > 0} onClick={onRetry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      );
    case "too_many_imports":
      return (
        <Alert variant="destructive">
          <AlertTitle>You have too many imports</AlertTitle>
          <AlertDescription>
            <p className="[overflow-wrap:anywhere]">{errorMessage(error)}</p>
            <p>
              Delete an old import under Your imports, then upload again. Deleting one keeps what it brought into your
              library.
            </p>
          </AlertDescription>
        </Alert>
      );
    case "import_running":
      return (
        <Alert>
          <AlertTitle>You already have an import running</AlertTitle>
          <AlertDescription>
            <p>One import at a time: wait for it to finish, or delete it, then upload again.</p>
            {running ? (
              <Link
                to="/settings/imports/$importId"
                params={{ importId: running.id }}
                className="mt-1 font-medium text-foreground underline underline-offset-4"
              >
                Open the running import
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      );
    default:
      return <ErrorAlert error={error} title="The upload failed" onRetry={onRetry} />;
  }
}
