// SPDX-License-Identifier: GPL-3.0-or-later

import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { ApiError, errorMessage, isApiError } from "@/api/errors";
import { escapeClearsSearchFirst, SearchInput } from "@/components/search-input";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCatalogSearch } from "@/features/catalog/catalog-search";
import { Cover } from "@/features/catalog/cover";
import { label, TYPE_LABELS } from "@/features/catalog/labels";
import type { ImportItem } from "./imports";

const PAGE_SIZE = 20;

/**
 * Choosing the work of an imported series by hand: one of the server's candidates, or any
 * entry found by searching the catalogue (the same search as adding a work). Series that
 * weren't applied yet can be skipped instead.
 */
export function ChooseDialog({
  importId,
  row,
  open,
  onOpenChange,
}: {
  importId: string;
  row: ImportItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(row.title);
  const [q] = useDebouncedValue(text.trim(), { wait: 300 });
  const results = useCatalogSearch({ q, page_size: PAGE_SIZE }, { enabled: open && q !== "" });
  const hits = results.data?.pages.flatMap((page) => page.hits) ?? [];

  const resolve = $api.useMutation("post", "/me/imports/{id}/items/{idx}/resolve", {
    onSuccess: (resolved, variables) => {
      // The series may move to another tab, and the import's counts change.
      void queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[1] === "string" && query.queryKey[1].startsWith("/me/imports"),
      });
      toast.success(
        variables.body.skip
          ? `Skipped ${row.title}.`
          : resolved.result === "applied" || resolved.result === "already_imported"
            ? `Imported ${row.title}.`
            : `Chosen: ${row.title} is imported with the rest.`,
      );
      onOpenChange(false);
    },
  });
  const choose = (entryId: string) =>
    resolve.mutate({ params: { path: { id: importId, idx: row.idx } }, body: { entry_id: entryId } });
  const skip = () => resolve.mutate({ params: { path: { id: importId, idx: row.idx } }, body: { skip: true } });
  const busy = resolve.isPending;
  const pickedId = busy && !resolve.variables?.body.skip ? resolve.variables?.body.entry_id : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resolve.reset();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={escapeClearsSearchFirst}>
        <DialogHeader>
          <DialogTitle>Choose the work</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {row.title}
            {row.author ? ` by ${row.author}` : ""}, from {row.source_name || "an unknown source"} in the backup.
          </DialogDescription>
        </DialogHeader>
        {resolve.error ? <ResolveError error={resolve.error} /> : null}
        {row.candidates.length > 0 ? (
          <section aria-label="Possible matches" className="grid gap-2">
            <h3 className="text-sm font-medium">Possible matches</h3>
            <ul className="grid gap-2">
              {row.candidates.map((c) => (
                <li key={c.entry_id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{c.title}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {[
                        c.year,
                        c.matched_title && c.matched_title !== c.title ? `“${c.matched_title}”` : "",
                        `${Math.round(c.score * 100)}% alike`,
                        c.authors_match ? "same author" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ChooseButton
                    title={c.title}
                    busy={busy}
                    picked={pickedId === c.entry_id}
                    onClick={() => choose(c.entry_id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-label="Search the catalogue" className="grid gap-2">
          <h3 className="text-sm font-medium">Search the catalogue</h3>
          <search>
            <SearchInput
              icon
              enterKeyHint="search"
              aria-label="Search the catalogue"
              placeholder="Search by any title"
              value={text}
              onChange={setText}
            />
          </search>
          {isApiError(results.error, "meta_unavailable") ? (
            <ErrorAlert
              error={results.error}
              title="The catalogue is unavailable"
              onRetry={() => void results.refetch()}
            />
          ) : results.error ? (
            <ErrorAlert error={results.error} onRetry={() => void results.refetch()} />
          ) : null}
          {q !== "" && results.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Searching…
            </p>
          ) : null}
          {results.data && hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing found for “{q}”. Try another title.</p>
          ) : null}
          {hits.length > 0 ? (
            <ul className="grid gap-2" aria-label="Catalogue results">
              {hits.map(({ entry, matched }) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <Cover url={entry.cover?.url} title={entry.title} className="w-10 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{entry.title}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {[matched ? `“${matched}”` : "", entry.year, label(TYPE_LABELS, entry.type)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {entry.library_work_id ? <Badge variant="outline">In library</Badge> : null}
                  <ChooseButton
                    title={entry.title}
                    busy={busy}
                    picked={pickedId === entry.id}
                    onClick={() => choose(entry.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {results.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                {results.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
                More results
              </Button>
            </div>
          ) : null}
        </section>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!row.result ? (
            <Button variant="outline" disabled={busy} onClick={skip}>
              {busy && resolve.variables?.body.skip ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Skip this series
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChooseButton({
  title,
  busy,
  picked,
  onClick,
}: {
  title: string;
  busy: boolean;
  picked: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" className="shrink-0" disabled={busy} onClick={onClick} aria-label={`Choose ${title}`}>
      {picked ? <Loader2 className="animate-spin" aria-hidden /> : null}
      Choose
    </Button>
  );
}

function ResolveError({ error }: { error: unknown }) {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "not_allowed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>You can't import that work</AlertTitle>
        <AlertDescription className="[overflow-wrap:anywhere]">{errorMessage(error)}</AlertDescription>
      </Alert>
    );
  }
  if (code === "import_running") {
    return (
      <Alert>
        <AlertTitle>The import is running</AlertTitle>
        <AlertDescription>Choose once it has stopped: the series can't change while it runs.</AlertDescription>
      </Alert>
    );
  }
  if (code === "import_item_state") {
    return (
      <Alert>
        <AlertTitle>This series can't be changed now</AlertTitle>
        <AlertDescription>It was imported or changed meanwhile. Close this and look again.</AlertDescription>
      </Alert>
    );
  }
  return <ErrorAlert error={error} title="That didn't work" />;
}
