// SPDX-License-Identifier: GPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ImageRetries = components["schemas"]["ImageRetries"];

/** An extension (all its sources) or one source. */
export type RetriesTarget =
  | { kind: "package"; pluginId: string; packageId: string }
  | { kind: "source"; sourceId: string; pluginId?: string | undefined; packageId?: string | undefined };

/** The server takes at most this many waits, each up to 30 s. */
const MAX_ATTEMPTS = 5;
const MAX_SECONDS = 30;

const PACKAGE_PATH = "/plugins/{plugin_id}/packages/{package_id}/image-retries";
const SOURCE_PATH = "/sources/{source_id}/image-retries";

const inRange = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= MAX_SECONDS;
const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`;

/** "2 more attempts, after 1 s then 3 s", or "no more attempts". */
export function delaysText(delays: readonly number[]): string {
  if (delays.length === 0) return "no more attempts";
  const waits = delays.map(seconds);
  const after = waits.length === 1 ? waits[0] : `${waits.slice(0, -1).join(", ")} then ${waits.at(-1)}`;
  return `${delays.length} more ${delays.length === 1 ? "attempt" : "attempts"}, after ${after}`;
}

/** Where what's in effect comes from, seen from the level being set. */
const fromText = (retries: ImageRetries) =>
  retries.level === retries.target_kind
    ? "set here"
    : retries.level === "package"
      ? "from its extension"
      : "the default";

function retriesOptions(target: RetriesTarget) {
  const { queryKey } =
    target.kind === "package"
      ? $api.queryOptions("get", PACKAGE_PATH, {
          params: { path: { plugin_id: target.pluginId, package_id: target.packageId } },
        })
      : $api.queryOptions("get", SOURCE_PATH, { params: { path: { source_id: target.sourceId } } });
  return {
    queryKey: queryKey as readonly unknown[],
    queryFn: async (): Promise<ImageRetries> => {
      const { data } =
        target.kind === "package"
          ? await api.GET(PACKAGE_PATH, {
              params: { path: { plugin_id: target.pluginId, package_id: target.packageId } },
            })
          : await api.GET(SOURCE_PATH, { params: { path: { source_id: target.sourceId } } });
      if (!data) throw new Error("The server answered without data.");
      return data;
    },
  };
}

/** Sets them (a list, `[]` for off) or removes this level's own setting (`null`, it inherits). */
async function save(target: RetriesTarget, delays: number[] | null): Promise<void> {
  if (target.kind === "package") {
    const path = { plugin_id: target.pluginId, package_id: target.packageId };
    if (delays === null) await api.DELETE(PACKAGE_PATH, { params: { path } });
    else await api.PUT(PACKAGE_PATH, { params: { path }, body: { delays_ms: delays } });
    return;
  }
  const path = { source_id: target.sourceId };
  if (delays === null) await api.DELETE(SOURCE_PATH, { params: { path } });
  else await api.PUT(SOURCE_PATH, { params: { path }, body: { delays_ms: delays } });
}

type Mode = "inherit" | "off" | "custom";
const modeOf = (retries: ImageRetries): Mode =>
  !retries.own ? "inherit" : retries.own.delays_ms.length === 0 ? "off" : "custom";

/**
 * How failed page images are tried again at one level: inherit (from the extension, or the
 * server's default), off, or waits of its own before each extra attempt.
 */
export function ImageRetriesSetting({ target, label }: { target: RetriesTarget; label: string }) {
  const options = retriesOptions(target);
  const retries = useQuery(options);
  // A source with a setting of its own: what it would inherit comes from its extension.
  const pkgTarget =
    target.kind === "source" && target.pluginId && target.packageId
      ? ({ kind: "package", pluginId: target.pluginId, packageId: target.packageId } as const)
      : undefined;
  const inherited = useQuery({
    ...retriesOptions(pkgTarget ?? { kind: "package", pluginId: "", packageId: "" }),
    enabled: !!pkgTarget && !!retries.data?.own,
  });
  if (retries.error) return <ErrorAlert error={retries.error} onRetry={() => void retries.refetch()} />;
  if (!retries.data) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />;

  // What choosing Inherit gives, when it's known.
  const own = retries.data.own;
  const base = own ? inherited.data : retries.data;
  const inheritText =
    base?.level === "package"
      ? `As its extension: ${delaysText(base.effective.delays_ms)}`
      : base
        ? `Default: ${delaysText(base.effective.delays_ms)}`
        : target.kind === "package"
          ? "The default"
          : "As its extension, or the default";
  return (
    // Keyed by what's saved, so the form starts over once a save comes back.
    <RetriesForm
      key={`${own?.updated_at ?? "none"}|${retries.data.effective.delays_ms.join()}`}
      target={target}
      label={label}
      retries={retries.data}
      inheritText={inheritText}
    />
  );
}

function RetriesForm({
  target,
  label,
  retries,
  inheritText,
}: {
  target: RetriesTarget;
  label: string;
  retries: ImageRetries;
  inheritText: string;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const saved = modeOf(retries);
  const [mode, setMode] = useState<Mode>(saved);
  // Custom starts from what's in effect, so a tweak starts there.
  const start = retries.effective.delays_ms.length > 0 ? retries.effective.delays_ms : [1000];
  const [rows, setRows] = useState(() => start.map((ms) => String(ms / 1000)));
  const update = useMutation({
    mutationFn: (delays: number[] | null) => save(target, delays),
    onSuccess: () => {
      // An extension's change shows on its sources too.
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[1] === PACKAGE_PATH || q.queryKey[1] === SOURCE_PATH,
      });
      toast.success("Image retries saved.");
    },
  });

  const values = rows.map((row) => (row.trim() === "" ? Number.NaN : Number(row)));
  const valid = values.every(inRange);
  const delays = values.map((v) => Math.round(v * 1000));
  const unchanged = saved === "custom" && delays.join() === retries.own?.delays_ms.join();
  const choose = (next: Mode) => {
    setMode(next);
    if (next === "inherit" && saved !== "inherit") update.mutate(null);
    if (next === "off" && saved !== "off") update.mutate([]);
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <NativeSelect id={id} value={mode} disabled={update.isPending} onChange={(e) => choose(e.target.value as Mode)}>
        <option value="inherit">{inheritText}</option>
        <option value="off">Off: no more attempts</option>
        <option value="custom">Waits of its own</option>
      </NativeSelect>
      {mode === "custom" ? (
        <form
          className="grid gap-2"
          aria-label="Waits before each extra attempt"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !unchanged) update.mutate(delays);
          }}
        >
          <ol className="grid gap-1.5">
            {rows.map((row, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-muted-foreground">Attempt {index + 2} after</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_SECONDS}
                  step={0.1}
                  className="w-20"
                  aria-label={`Wait before attempt ${index + 2}, in seconds`}
                  aria-invalid={!inRange(values[index])}
                  value={row}
                  onChange={(e) => setRows(rows.map((r, i) => (i === index ? e.target.value : r)))}
                />
                <span className="text-muted-foreground">s</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-8"
                  aria-label={`Remove attempt ${index + 2}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {valid ? null : (
            <p className="text-xs text-destructive" role="alert">
              Each wait is 0 to {MAX_SECONDS} s.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length >= MAX_ATTEMPTS}
              onClick={() => setRows([...rows, rows.at(-1) ?? "1"])}
            >
              <Plus aria-hidden />
              Add attempt
            </Button>
            <Button type="submit" size="sm" disabled={!valid || unchanged || update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </form>
      ) : null}
      {update.error ? <ErrorAlert error={update.error} title="Not saved" /> : null}
      <p className="text-xs text-muted-foreground" data-testid="retries-in-effect">
        In effect: {delaysText(retries.effective.delays_ms)} ({fromText(retries)}).
      </p>
    </div>
  );
}
