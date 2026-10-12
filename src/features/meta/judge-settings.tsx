// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, RotateCcw, Settings2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { Field } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Judge = components["schemas"]["DuplicateJudge"];
type Settings = components["schemas"]["DuplicateJudgeSettings"];

const judgeKey = () => $api.queryOptions("get", "/system/meta/duplicate-judge").queryKey;

/** The decision model that rates suspected duplicates: whether it's on, which one, and its settings. */
export function JudgeCard() {
  const judge = $api.useQuery("get", "/system/meta/duplicate-judge");
  const [open, setOpen] = useState(false);
  const data = judge.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Decision model</CardTitle>
        <CardDescription className="[overflow-wrap:anywhere]">
          {data
            ? data.enabled
              ? `On: ${[data.kind, data.model].filter(Boolean).join(" · ")} rates each pair. ${origin(data)}`
              : `Off: nothing is sent to a model. ${origin(data)}`
            : "A model can rate each suspected pair, to help you decide."}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={!data} onClick={() => setOpen(true)}>
            <Settings2 aria-hidden />
            Settings
          </Button>
        </CardAction>
      </CardHeader>
      {judge.error ? (
        <div className="px-6">
          <ErrorAlert error={judge.error} onRetry={() => void judge.refetch()} />
        </div>
      ) : null}
      {/* Keyed by what's saved, so the form starts over from it each time. */}
      {data ? <JudgeDialog key={JSON.stringify(data) + open} judge={data} open={open} onOpenChange={setOpen} /> : null}
    </Card>
  );
}

const origin = (judge: Judge) =>
  judge.origin === "admin" ? "Set here, over the service's configuration." : "From the service's configuration.";

function JudgeDialog({
  judge,
  open,
  onOpenChange,
}: {
  judge: Judge;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const enabledId = useId();
  const coversId = useId();
  const [form, setForm] = useState<Settings>({
    enabled: judge.enabled,
    kind: judge.kind,
    url: judge.url ?? "",
    model: judge.model ?? "",
    api_key: "",
    covers: judge.covers,
  });
  const set = (change: Partial<Settings>) => setForm({ ...form, ...change });
  // An empty key keeps the stored one; empty texts are left out.
  const body = (): Settings => ({
    enabled: form.enabled,
    kind: form.kind.trim(),
    ...(form.url?.trim() ? { url: form.url.trim() } : {}),
    ...(form.model?.trim() ? { model: form.model.trim() } : {}),
    ...(form.api_key ? { api_key: form.api_key } : {}),
    covers: form.covers ?? false,
  });
  const stored = (saved: Judge) => queryClient.setQueryData(judgeKey(), saved);
  const save = $api.useMutation("put", "/system/meta/duplicate-judge", {
    onSuccess: (saved) => {
      stored(saved);
      onOpenChange(false);
      toast.success(saved.enabled ? "The decision model is on." : "Decision model settings saved.");
    },
  });
  const test = $api.useMutation("post", "/system/meta/duplicate-judge/test");
  const reset = $api.useMutation("post", "/system/meta/duplicate-judge/reset", {
    onSuccess: (saved) => {
      stored(saved);
      onOpenChange(false);
      toast.success("Back to the service's configuration.");
    },
  });
  const verdict = test.data?.verdict;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ body: body() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Decision model</DialogTitle>
            <DialogDescription>
              Rates each suspected pair: same work, related work or different. These settings win over the service's
              configuration until you reset them.
            </DialogDescription>
          </DialogHeader>
          {save.error ? <ErrorAlert error={save.error} title="Not saved" /> : null}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={enabledId}>Use the model</Label>
            <Switch id={enabledId} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
          </div>
          <Field label="Kind of service" hint="As the metadata service names it.">
            {(aria) => <Input {...aria} required value={form.kind} onChange={(e) => set({ kind: e.target.value })} />}
          </Field>
          <Field label="URL">
            {(aria) => (
              <Input
                {...aria}
                type="url"
                inputMode="url"
                value={form.url ?? ""}
                onChange={(e) => set({ url: e.target.value })}
              />
            )}
          </Field>
          <Field label="Model">
            {(aria) => <Input {...aria} value={form.model ?? ""} onChange={(e) => set({ model: e.target.value })} />}
          </Field>
          <Field
            label="API key"
            hint={judge.has_api_key ? "A key is saved: leave empty to keep it." : "If the service needs one."}
          >
            {(aria) => (
              <Input
                {...aria}
                type="password"
                autoComplete="off"
                value={form.api_key ?? ""}
                onChange={(e) => set({ api_key: e.target.value })}
              />
            )}
          </Field>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={coversId}>Send covers too (to models that read images)</Label>
            <Switch id={coversId} checked={form.covers ?? false} onCheckedChange={(covers) => set({ covers })} />
          </div>
          <div className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">Ask it about a made-up pair, without saving.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={test.isPending || !form.kind.trim()}
                onClick={() => test.mutate({ body: body() })}
              >
                {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
                Test
              </Button>
            </div>
            {test.error ? <ErrorAlert error={test.error} title="The test didn't run" /> : null}
            {test.data ? (
              <p role="status" className={test.data.ok ? "text-sm text-success" : "text-sm text-destructive"}>
                {test.data.ok
                  ? `It answered${verdict ? `: ${verdict.choice.replaceAll("_", " ")}, ${Math.round(verdict.same * 100)}% the same` : ""}.`
                  : `It didn't answer: ${test.data.error ?? "no reason given"}`}
              </p>
            ) : null}
          </div>
          {reset.error ? <ErrorAlert error={reset.error} title="Not reset" /> : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {judge.origin === "admin" ? (
              <Button type="button" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate({})}>
                <RotateCcw aria-hidden />
                Use the configuration
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
