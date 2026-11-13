// SPDX-License-Identifier: GPL-3.0-or-later

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, History } from "lucide-react";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ImportUpload } from "./import-upload";
import { type Import, importsQuery, isRunning, plural, STATE_LABELS } from "./imports";

/** Settings → Import: how to make a backup, the upload and the user's imports. */
export function ImportsCard() {
  const imports = useQuery(importsQuery());
  const list = imports.data?.imports ?? [];
  const running = list.find((i) => isRunning(i.state));
  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Import from Suwayomi or Mihon</CardTitle>
          <CardDescription>
            Bring your library from another app, with the chapters you read and your bookmarks.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            <li>
              Make a backup in the other app. In Suwayomi, open Settings → Backup and create one. In Mihon, open
              Settings → Data and storage and create one.
            </li>
            <li>
              Only series in that app's library are in the backup: add the ones you want to bring along to its library
              first.
            </li>
            <li>
              Upload the backup here. You get a preview of what happens to each series; nothing changes in your library
              until you apply it.
            </li>
          </ol>
          <ImportUpload running={running} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your imports</CardTitle>
          <CardDescription>Deleting an import keeps what it already brought into your library.</CardDescription>
        </CardHeader>
        <CardContent>
          {imports.error ? <ErrorAlert error={imports.error} onRetry={() => void imports.refetch()} /> : null}
          {imports.isPending ? <Loading /> : null}
          {imports.data && list.length === 0 ? (
            <EmptyState icon={<History />} title="No imports yet" className="py-10" />
          ) : null}
          {list.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-lg border" aria-label="Your imports">
              {list.map((item) => (
                <li key={item.id}>
                  <ImportRow item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportRow({ item }: { item: Import }) {
  const state = item.state;
  const failed = state === "failed" || state === "cancelled";
  return (
    <Link
      to="/settings/imports/$importId"
      params={{ importId: item.id }}
      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{formatDateTime(item.created_at)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {plural(item.summary.series, "series", "series")} · {plural(item.summary.chapters_read, "chapter")} read
          {state === "previewing" ? ` · ${item.progress.done} of ${item.progress.total} matched` : ""}
        </p>
      </div>
      <Badge variant={failed ? "destructive" : isRunning(state) ? "secondary" : "outline"}>{STATE_LABELS[state]}</Badge>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
