// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Play, Square } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api, api } from "@/api/client";
import { errorMessage, isApiError } from "@/api/errors";
import { Field } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { initialParamValue, type Job, type JobParam, type ParamValue, paramsToSend } from "./jobs";

function useInvalidateJobs() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[1] === "string" && /^\/(jobs|job-runs)/.test(q.queryKey[1]),
    });
}

/** Runs a job now; a job with parameters asks for them first. */
export function RunJobButton({ job, size = "sm" }: { job: Job; size?: "sm" | "default" }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateJobs();
  const [open, setOpen] = useState(false);
  const goToRun = (runId: string) =>
    void navigate({ to: "/admin/jobs/$jobId/runs/$runId", params: { jobId: job.id, runId } });

  const run = $api.useMutation("post", "/jobs/{job_id}/run", {
    onSuccess: (started) => {
      setOpen(false);
      invalidate();
      toast.success(`${job.name} started.`, { action: { label: "Watch", onClick: () => goToRun(started.id) } });
    },
    onError: async (error) => {
      if (!isApiError(error, "already_running")) return;
      // Someone else started it: offer the run that is going.
      setOpen(false);
      invalidate();
      const current = await api
        .GET("/jobs/{job_id}", { params: { path: { job_id: job.id } } })
        .then((r) => r.data?.current_run_id)
        .catch(() => undefined);
      toast.info(
        `${job.name} is already running.`,
        current ? { action: { label: "Watch", onClick: () => goToRun(current) } } : {},
      );
    },
  });
  const start = (params: Record<string, string>) =>
    run.mutate({ params: { path: { job_id: job.id } }, body: Object.keys(params).length > 0 ? { params } : {} });

  return (
    <>
      <Button
        size={size}
        variant="outline"
        disabled={job.running || run.isPending}
        onClick={() => (job.params.length > 0 ? setOpen(true) : start({}))}
      >
        {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
        Run now
      </Button>
      {run.error && !isApiError(run.error, "already_running") && !open ? (
        <span role="alert" className="text-xs text-destructive">
          {errorMessage(run.error)}
        </span>
      ) : null}
      {job.params.length > 0 ? (
        <RunJobDialog
          key={String(open)}
          job={job}
          open={open}
          onOpenChange={setOpen}
          pending={run.isPending}
          error={isApiError(run.error, "already_running") ? undefined : run.error}
          onRun={start}
        />
      ) : null}
    </>
  );
}

function RunJobDialog({
  job,
  open,
  onOpenChange,
  pending,
  error,
  onRun,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: unknown;
  onRun: (params: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, ParamValue>>(() =>
    Object.fromEntries(job.params.map((p) => [p.name, initialParamValue(p)])),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onRun(paramsToSend(job.params, values));
          }}
        >
          <DialogHeader>
            <DialogTitle>Run {job.name}</DialogTitle>
            <DialogDescription>{job.description}</DialogDescription>
          </DialogHeader>
          {error ? <ErrorAlert error={error} title="Didn't start" /> : null}
          {job.params.map((param) => (
            <ParamField
              key={param.name}
              param={param}
              value={values[param.name] ?? initialParamValue(param)}
              onChange={(value) => setValues({ ...values, [param.name]: value })}
            />
          ))}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              Run now
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: JobParam;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const id = useId();
  const hint = [param.description, param.default ? `Default: ${param.default}.` : undefined].filter(Boolean).join(" ");
  if (param.type === "bool") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label htmlFor={id}>{param.name}</Label>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={onChange} />
      </div>
    );
  }
  if (param.type === "string_list" && param.choices?.length) {
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{param.name}</legend>
        {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {param.choices.map((choice) => (
            <div key={choice} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${choice}`}
                checked={list.includes(choice)}
                onCheckedChange={(checked) => onChange(checked ? [...list, choice] : list.filter((c) => c !== choice))}
              />
              <Label htmlFor={`${id}-${choice}`} className="font-normal">
                {choice}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <Field label={param.name} hint={hint || undefined}>
      {(aria) =>
        param.type === "string_list" ? (
          <Textarea
            {...aria}
            rows={3}
            placeholder="One per line"
            value={Array.isArray(value) ? value.join("\n") : ""}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        ) : (
          <Input
            {...aria}
            type={param.type === "int" ? "number" : "text"}
            inputMode={param.type === "int" ? "numeric" : undefined}
            step={param.type === "int" ? 1 : undefined}
            required={param.required}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/** Stops a running run, for jobs that can stop midway. */
export function CancelRunButton({ runId, label = "Cancel" }: { runId: string; label?: string }) {
  const invalidate = useInvalidateJobs();
  const cancel = $api.useMutation("post", "/job-runs/{run_id}/cancel", {
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-destructive"
      disabled={cancel.isPending}
      onClick={() => cancel.mutate({ params: { path: { run_id: runId } } })}
    >
      <Square aria-hidden />
      {label}
    </Button>
  );
}
