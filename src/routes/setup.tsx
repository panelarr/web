// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { $api, api } from "@/api/client";
import { isApiError } from "@/api/errors";
import { hasSessionHint, setupQuery } from "@/auth/session";
import { AuthLayout } from "@/components/auth-layout";
import { formValues, PasswordConfirm, TextField } from "@/components/form";
import { ErrorAlert } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MetaConnectionPanel } from "@/features/setup/meta-connection";
import { PluginsPanel } from "@/features/setup/plugins-panel";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "admin", label: "Admin account" },
  { id: "meta", label: "Metadata" },
  { id: "plugins", label: "Sources" },
  { id: "finish", label: "Finish" },
] as const;
type Step = (typeof STEPS)[number]["id"];

const isStep = (value: unknown): value is Step => STEPS.some((step) => step.id === value);

/**
 * The first-run wizard: create the admin, connect the metadata service, optionally add a
 * source plugin, finish. Once finished, nobody can open it again.
 */
export const Route = createFileRoute("/setup")({
  validateSearch: (search: Record<string, unknown>): { step?: Step } =>
    isStep(search.step) ? { step: search.step } : {},
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(setupQuery());
    if (status.completed) throw redirect({ to: "/" });
    if (status.admin_created) {
      // Only the admin, signed in, may carry on.
      if (!hasSessionHint()) throw redirect({ to: "/login", search: { redirect: "/setup" } });
      const me = await api.GET("/me").catch((error: unknown) => {
        if (isApiError(error, "unauthenticated")) throw redirect({ to: "/login", search: { redirect: "/setup" } });
        throw error;
      });
      if (me.data?.user.role !== "admin") throw redirect({ to: "/" });
    }
    return { status };
  },
  component: SetupPage,
});

function SetupPage() {
  const { step: asked } = Route.useSearch();
  const loaded = Route.useRouteContext().status;
  const status = $api.useQuery("get", "/setup").data ?? loaded;
  const step: Step = !status.admin_created ? "admin" : asked && asked !== "admin" ? asked : "meta";
  const index = STEPS.findIndex((s) => s.id === step);

  return (
    <AuthLayout title="Set up Panelarr" description="A few steps and your library is ready." wide>
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === step ? "step" : undefined}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-medium",
                i < index && "border-primary bg-primary text-primary-foreground",
                i === index && "border-primary text-primary",
              )}
            >
              {i < index ? <Check className="size-4" aria-label="done" /> : i + 1}
            </span>
            <span className={cn("text-center text-xs", i === index ? "font-medium" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {step === "admin" ? <AdminStep /> : null}
      {step === "meta" ? <MetaStep ready={status.meta_ready} configured={status.meta_configured} /> : null}
      {step === "plugins" ? <PluginsStep /> : null}
      {step === "finish" ? <FinishStep ready={status.meta_ready} /> : null}
    </AuthLayout>
  );
}

function StepCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter className="flex flex-wrap justify-end gap-2 border-t pt-6">{footer}</CardFooter> : null}
    </Card>
  );
}

function useGoTo() {
  const navigate = useNavigate();
  return (step: Step) => navigate({ to: "/setup", search: { step } });
}

function AdminStep() {
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const [mismatch, setMismatch] = useState(false);
  const create = $api.useMutation("post", "/setup/admin", {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await goTo("meta");
    },
  });
  return (
    <StepCard
      title="Create the admin account"
      description="The first account manages Panelarr: users, sources and settings."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const { username = "", password = "", confirm = "", display_name = "" } = formValues(event.currentTarget);
          setMismatch(password !== confirm);
          if (password !== confirm) return;
          create.mutate({ body: { username, password, ...(display_name ? { display_name } : {}) } });
        }}
      >
        {create.error && !isApiError(create.error, "invalid_request") ? <ErrorAlert error={create.error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Username"
            name="username"
            error={create.error}
            autoComplete="username"
            autoCapitalize="none"
            required
            minLength={2}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._\-]*"
            autoFocus
          />
          <TextField label="Display name" name="display_name" error={create.error} maxLength={100} hint="Optional." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Password"
            name="password"
            type="password"
            error={create.error}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            hint="At least 8 characters."
          />
          <PasswordConfirm mismatch={mismatch} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Create and continue
          </Button>
        </div>
      </form>
    </StepCard>
  );
}

function MetaStep({ ready, configured }: { ready: boolean; configured: boolean }) {
  const goTo = useGoTo();
  return (
    <StepCard
      title="Connect the metadata service"
      description="Panelarr finds works in the metadata service's catalogue. It needs a provider with entries before anything can be added."
      footer={
        <Button disabled={!configured} onClick={() => void goTo("plugins")}>
          {ready ? "Continue" : "Continue without entries"}
        </Button>
      }
    >
      <MetaConnectionPanel />
      {configured && !ready ? (
        <p className="mt-4 text-xs text-muted-foreground">
          You can carry on while the first sync runs. Until a provider has entries, Panelarr shows as degraded and
          nothing can be added.
        </p>
      ) : null}
    </StepCard>
  );
}

function PluginsStep() {
  const goTo = useGoTo();
  const plugins = $api.useQuery("get", "/plugins");
  const any = (plugins.data?.plugins.length ?? 0) > 0;
  return (
    <StepCard
      title="Add a source plugin"
      description="Optional. Source plugins let Panelarr read and download chapters. You can add them later in Admin."
      footer={
        <>
          <Button variant="ghost" onClick={() => void goTo("meta")}>
            Back
          </Button>
          <Button variant={any ? "default" : "outline"} onClick={() => void goTo("finish")}>
            {any ? "Continue" : "Skip for now"}
          </Button>
        </>
      }
    >
      <PluginsPanel />
    </StepCard>
  );
}

function FinishStep({ ready }: { ready: boolean }) {
  const goTo = useGoTo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const complete = $api.useMutation("post", "/setup/complete", {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: "/", replace: true });
    },
  });
  return (
    <StepCard
      title="All set"
      description="Finish to open your library. Invite people from Admin → Users."
      footer={
        <>
          <Button variant="ghost" onClick={() => void goTo("plugins")}>
            Back
          </Button>
          <Button onClick={() => complete.mutate({})} disabled={complete.isPending}>
            {complete.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Finish setup
          </Button>
        </>
      }
    >
      {complete.error ? <ErrorAlert error={complete.error} /> : null}
      {!ready ? (
        <Alert>
          <AlertDescription>
            The metadata service has no entries yet, so Panelarr will show as degraded until its first sync finishes.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">Panelarr is connected and ready.</p>
      )}
    </StepCard>
  );
}
