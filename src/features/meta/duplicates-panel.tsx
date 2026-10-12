// SPDX-License-Identifier: GPL-3.0-or-later

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkOptions, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Copy, Loader2, Merge, RotateCcw, Split } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading, PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Cover } from "@/features/catalog/cover";
import { label, TYPE_LABELS } from "@/features/catalog/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JudgeCard } from "./judge-settings";

type Pair = components["schemas"]["DuplicatePair"];
type Entry = components["schemas"]["CatalogEntrySummary"];
type Verdict = components["schemas"]["DuplicateVerdict"];
type PairStatus = "open" | "confirmed" | "dismissed";

const STATUSES: Record<PairStatus, string> = { open: "To review", confirmed: "Merged", dismissed: "Different works" };
const CHOICES: Record<string, string> = {
  same_work: "Same work",
  related_work: "Related work",
  different: "Different",
};
const MIN_SCORES = [0, 50, 70, 90];

/** The list's filters and an open pair, in the page's search (?tab=duplicates&…). */
export interface DuplicatesSearch {
  /** Open (to review) unless set. */
  show?: Exclude<PairStatus, "open">;
  /** In percent, 0–100. */
  min?: number;
  judged?: true;
  pair?: number;
}

export function duplicatesSearch(search: Record<string, unknown>): DuplicatesSearch {
  const out: DuplicatesSearch = {};
  if (search.show === "confirmed" || search.show === "dismissed") out.show = search.show;
  const min = Number(search.min);
  if (Number.isInteger(min) && min > 0 && min <= 100) out.min = min;
  if (search.judged === true || search.judged === "true") out.judged = true;
  const pair = Number(search.pair);
  if (Number.isInteger(pair) && pair > 0) out.pair = pair;
  return out;
}

const to = "/admin/metadata" as const;
const listLink = (search: DuplicatesSearch): LinkOptions => {
  const { pair: _, ...rest } = search;
  return { to, search: { tab: "duplicates", ...rest } };
};
const pairLink = (search: DuplicatesSearch, pair: number): LinkOptions => ({
  to,
  search: { tab: "duplicates", ...search, pair },
});

const percent = (n: number) => `${Math.round(n * 100)}%`;
const isDuplicates = (key: readonly unknown[]) =>
  typeof key[1] === "string" && key[1].startsWith("/system/meta/duplicates");

/** Pairs of catalogue entries the metadata service suspects are one work: review, merge or keep apart. */
export function DuplicatesPanel({
  search,
  onSearch,
}: {
  search: DuplicatesSearch;
  onSearch: (change: Partial<DuplicatesSearch>) => void;
}) {
  if (search.pair) return <PairView pairId={search.pair} search={search} />;
  return <PairList search={search} onSearch={onSearch} />;
}

function PairList({
  search,
  onSearch,
}: {
  search: DuplicatesSearch;
  onSearch: (change: Partial<DuplicatesSearch>) => void;
}) {
  const status: PairStatus = search.show ?? "open";
  const query = {
    status,
    ...(search.min ? { min_score: search.min / 100 } : {}),
    ...(search.judged ? { judged_only: true } : {}),
  };
  const pairs = useInfiniteQuery({
    queryKey: ["get", "/system/meta/duplicates", query],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/system/meta/duplicates", {
        params: { query: { ...query, page_size: 25, ...(pageParam ? { page_token: pageParam } : {}) } },
      });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_page_token || undefined,
  });
  const list = pairs.data?.pages.flatMap((page) => page.pairs) ?? [];
  const total = pairs.data?.pages[0]?.total_size;
  const judgedId = useId();
  return (
    <div className="grid gap-4">
      <JudgeCard />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-44">
          <NativeSelect
            aria-label="Show"
            value={status}
            onChange={(e) =>
              onSearch({
                show: e.target.value === "open" ? undefined : (e.target.value as DuplicatesSearch["show"]),
              })
            }
          >
            {(Object.keys(STATUSES) as PairStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUSES[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-44">
          <NativeSelect
            aria-label="Alike at least"
            value={String(search.min ?? 0)}
            onChange={(e) => onSearch({ min: Number(e.target.value) || undefined })}
          >
            {MIN_SCORES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any likeness" : `${n}% alike or more`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={judgedId}
            checked={search.judged === true}
            onCheckedChange={(on) => onSearch({ judged: on === true ? true : undefined })}
          />
          <Label htmlFor={judgedId} className="font-normal">
            Rated by the model
          </Label>
        </div>
      </div>
      {total !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "pair" : "pairs"}
          {status === "open" ? " to review, most alike first" : ""}
        </p>
      ) : null}
      {pairs.error ? <ErrorAlert error={pairs.error} onRetry={() => void pairs.refetch()} /> : null}
      {pairs.isPending ? <Loading /> : null}
      {pairs.data && list.length === 0 ? (
        <EmptyState icon={<Copy />} title={status === "open" ? "Nothing to review" : "None"}>
          {status === "open" ? "The metadata service suspects no duplicates with these filters." : null}
        </EmptyState>
      ) : null}
      {list.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-label="Pairs">
          {list.map((pair) => (
            <li key={pair.id}>
              <PairRow pair={pair} search={search} />
            </li>
          ))}
        </ul>
      ) : null}
      {pairs.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={pairs.isFetchingNextPage} onClick={() => void pairs.fetchNextPage()}>
            {pairs.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            More pairs
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        verdict.choice === "same_work" && "border-success/50 text-success",
        verdict.choice === "different" && "border-destructive/50 text-destructive",
      )}
    >
      {CHOICES[verdict.choice] ?? verdict.choice} · {percent(verdict.same)}
    </Badge>
  );
}

function PairRow({ pair, search }: { pair: Pair; search: DuplicatesSearch }) {
  return (
    <Link
      {...pairLink(search, pair.id)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
      aria-label={`${pair.entry_a.title} and ${pair.entry_b.title}`}
    >
      <div className="flex shrink-0 -space-x-3">
        <Cover url={pair.entry_a.cover?.url} title={pair.entry_a.title} className="w-9 rounded ring-2 ring-card" />
        <Cover url={pair.entry_b.cover?.url} title={pair.entry_b.title} className="w-9 rounded ring-2 ring-card" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">
          {pair.entry_a.title} <span className="text-muted-foreground">and</span> {pair.entry_b.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{percent(pair.score)} alike</span>
          {pair.verdict ? <VerdictBadge verdict={pair.verdict} /> : null}
          {pair.decided_at ? (
            <span>
              decided {formatRelative(pair.decided_at)}
              {pair.decided_by ? ` by ${pair.decided_by}` : ""}
            </span>
          ) : null}
        </p>
        {pair.note ? <p className="mt-1 text-xs [overflow-wrap:anywhere]">{pair.note}</p> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function EntrySide({ entry, side }: { entry: Entry; side: "A" | "B" }) {
  const facts = [label(TYPE_LABELS, entry.type), entry.year, entry.original_language?.toUpperCase()]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 gap-3">
      <Cover url={entry.cover?.url} title={entry.title} className="w-20 shrink-0 rounded-md" />
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium text-muted-foreground">{side}</p>
        <Link
          to="/catalog/$entryId"
          params={{ entryId: entry.id }}
          className="font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
        >
          {entry.title}
        </Link>
        <p className="text-xs text-muted-foreground">{entry.id}</p>
        {facts ? <p className="mt-1 text-xs text-muted-foreground">{facts}</p> : null}
        {entry.genres.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{entry.genres.join(", ")}</p>
        ) : null}
        {entry.library_work_id ? (
          <Badge variant="secondary" className="mt-1">
            In your library
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

/** One pair, side by side, with what made them alike, the model's verdict and the decision. */
function PairView({ pairId, search }: { pairId: number; search: DuplicatesSearch }) {
  const pair = useQuery(
    $api.queryOptions("get", "/system/meta/duplicates/{pair_id}", { params: { path: { pair_id: pairId } } }),
  );
  const data = pair.data;
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link {...listLink(search)}>
          <ArrowLeft aria-hidden />
          Duplicates
        </Link>
      </Button>
      {pair.error ? <ErrorAlert error={pair.error} onRetry={() => void pair.refetch()} /> : null}
      {pair.isPending ? <Loading /> : null}
      {data ? (
        <>
          <PageHeader
            level={2}
            title={`${percent(data.score)} alike`}
            description={
              data.status === "open"
                ? `Suspected ${formatRelative(data.created_at)}. Merging can't be undone.`
                : `${STATUSES[data.status as PairStatus] ?? data.status}${
                    data.decided_at ? ` ${formatRelative(data.decided_at)}` : ""
                  }${data.decided_by ? ` by ${data.decided_by}` : ""}.`
            }
            actions={<PairActions pair={data} search={search} />}
          />
          {data.note ? <p className="mb-4 text-sm [overflow-wrap:anywhere]">Note: {data.note}</p> : null}
          <div className="grid gap-6">
            <Card>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <EntrySide entry={data.entry_a} side="A" />
                <EntrySide entry={data.entry_b} side="B" />
              </CardContent>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Signals pair={data} />
              <VerdictCard verdict={data.verdict} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function Facts({ rows }: { rows: Array<[string, string | undefined]> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {rows.map(([name, value]) =>
        value ? (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="[overflow-wrap:anywhere]">{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

const both = (a: string | number | undefined, b: string | number | undefined) =>
  a === undefined && b === undefined ? undefined : a === b ? `${a} (both)` : `${a ?? "?"} / ${b ?? "?"}`;

function Signals({ pair }: { pair: Pair }) {
  const s = pair.signals;
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle as="h3">Why they look alike</CardTitle>
      </CardHeader>
      <CardContent>
        <Facts
          rows={[
            ["Titles", `${percent(s.title)} alike${s.title_a && s.title_b ? `: ${s.title_a} / ${s.title_b}` : ""}`],
            [
              "People",
              s.people < 0
                ? "Not known on one side"
                : `${percent(s.people)} in common${s.shared_people.length ? `: ${s.shared_people.join(", ")}` : ""}`,
            ],
            ["Year", both(s.year_a, s.year_b)],
            ["Type", both(label(TYPE_LABELS, s.type_a), label(TYPE_LABELS, s.type_b))],
            ["Language", both(s.language_a, s.language_b)],
            ["Same IDs elsewhere", s.shared_ids.length ? s.shared_ids.join(", ") : "None"],
            ["Same provider", s.same_provider ? "Yes" : "No"],
          ]}
        />
      </CardContent>
    </Card>
  );
}

function VerdictCard({ verdict }: { verdict: Verdict | undefined }) {
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle as="h3">The model's verdict</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {verdict ? (
          <>
            <p>
              <VerdictBadge verdict={verdict} />
            </p>
            <Facts
              rows={[
                ["Judge", [verdict.judge, verdict.model].filter(Boolean).join(" · ")],
                [
                  "Chances",
                  Object.entries(verdict.probabilities)
                    .map(([choice, p]) => `${CHOICES[choice] ?? choice} ${percent(Number(p))}`)
                    .join(" · "),
                ],
                ["Confidence", verdict.confidence !== undefined ? percent(verdict.confidence) : undefined],
                ["Tokens", verdict.tokens !== undefined ? String(verdict.tokens) : undefined],
                ["When", verdict.at ? formatDateTime(verdict.at) : undefined],
              ]}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not rated: the decision model is off or hasn't seen it yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PairActions({ pair, search }: { pair: Pair; search: DuplicatesSearch }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"merge" | "dismiss">();
  const refresh = () => void queryClient.invalidateQueries({ predicate: (q) => isDuplicates(q.queryKey) });
  const reopen = $api.useMutation("post", "/system/meta/duplicates/{pair_id}/reopen", {
    onSuccess: () => {
      refresh();
      toast.success("Back to review.");
    },
  });
  if (pair.status === "dismissed") {
    return (
      <div className="grid justify-items-end gap-1">
        <Button
          variant="outline"
          disabled={reopen.isPending}
          onClick={() => reopen.mutate({ params: { path: { pair_id: pair.id } } })}
        >
          <RotateCcw aria-hidden />
          Take back
        </Button>
        {reopen.error ? <ErrorAlert error={reopen.error} title="Not taken back" /> : null}
      </div>
    );
  }
  if (pair.status !== "open") return null;
  const done = (message: string) => {
    setDialog(undefined);
    refresh();
    // The catalogue may have changed (a merge points one entry to the other).
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[1] === "string" && q.queryKey[1].startsWith("/catalog"),
    });
    toast.success(message);
    void navigate(listLink(search));
  };
  return (
    <>
      <Button variant="outline" onClick={() => setDialog("dismiss")}>
        <Split aria-hidden />
        Different works
      </Button>
      <Button onClick={() => setDialog("merge")}>
        <Merge aria-hidden />
        Merge
      </Button>
      <MergeDialog
        pair={pair}
        open={dialog === "merge"}
        onOpenChange={(o) => setDialog(o ? "merge" : undefined)}
        onDone={done}
      />
      <DismissDialog
        pair={pair}
        open={dialog === "dismiss"}
        onOpenChange={(o) => setDialog(o ? "dismiss" : undefined)}
        onDone={done}
      />
    </>
  );
}

function MergeDialog({
  pair,
  open,
  onOpenChange,
  onDone,
}: {
  pair: Pair;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const [keep, setKeep] = useState<"a" | "b" | "">("");
  const [note, setNote] = useState("");
  const merge = $api.useMutation("post", "/system/meta/duplicates/{pair_id}/confirm", {
    onSuccess: (merged) => {
      const kept = merged.entry_id === pair.entry_a.id ? pair.entry_a : pair.entry_b;
      onDone(`Merged: ${kept.title} stays.`);
    },
  });
  const options: Array<["a" | "b" | "", string]> = [
    ["", "The more popular one (the service picks)"],
    ["a", pair.entry_a.title],
    ["b", pair.entry_b.title],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            merge.mutate({
              params: { path: { pair_id: pair.id } },
              body: { ...(keep ? { keep } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Merge into one entry?</DialogTitle>
            <DialogDescription>
              This can't be undone: the other entry's records move over and its ID points to the one that stays.
            </DialogDescription>
          </DialogHeader>
          {merge.error ? <ErrorAlert error={merge.error} title="Not merged" /> : null}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Which one stays</legend>
            {options.map(([value, text]) => (
              <div key={value || "auto"} className="flex items-center gap-3">
                <input
                  type="radio"
                  id={`${id}-${value || "auto"}`}
                  name={`${id}-keep`}
                  checked={keep === value}
                  onChange={() => setKeep(value)}
                  className="size-4 accent-primary"
                />
                <Label htmlFor={`${id}-${value || "auto"}`} className="font-normal [overflow-wrap:anywhere]">
                  {text}
                </Label>
              </div>
            ))}
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-note`}>Note (optional)</Label>
            <Textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={merge.isPending}>
              {merge.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Merge aria-hidden />}
              Merge for good
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({
  pair,
  open,
  onOpenChange,
  onDone,
}: {
  pair: Pair;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const dismiss = $api.useMutation("post", "/system/meta/duplicates/{pair_id}/dismiss", {
    onSuccess: () => onDone("Kept apart as different works."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            dismiss.mutate({
              params: { path: { pair_id: pair.id } },
              body: note.trim() ? { note: note.trim() } : {},
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Different works?</DialogTitle>
            <DialogDescription>
              {pair.entry_a.title} and {pair.entry_b.title} stay apart, and won't be suggested again. You can take it
              back later.
            </DialogDescription>
          </DialogHeader>
          {dismiss.error ? <ErrorAlert error={dismiss.error} title="Not saved" /> : null}
          <div className="grid gap-2">
            <Label htmlFor={`${id}-note`}>Note (optional)</Label>
            <Textarea
              id={`${id}-note`}
              rows={2}
              placeholder="e.g. a sequel, not the same work"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={dismiss.isPending}>
              {dismiss.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Split aria-hidden />}
              Different works
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
