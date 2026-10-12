// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { Field, formValues, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert } from "@/components/states";
import { Button } from "@/components/ui/button";
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

type S = components["schemas"];
export type Solver = S["Solver"];
export type NetworkProxy = S["Proxy"];
export type Profile = S["NetworkProfile"];
export type Owner = NonNullable<Profile["owner"]>;

const ID_PATTERN = "[a-z0-9][a-z0-9_\\-]{0,39}";

/** Refreshes every network list (shared and custom) after a change. */
export function useNetworkRefresh() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[1] === "string" &&
        (q.queryKey[1].startsWith("/network/") ||
          q.queryKey[1].endsWith("/network") ||
          q.queryKey[1] === "/system/meta/network"),
    });
}

/** What a check found. */
export function TestResult({ result }: { result: S["NetworkTest"] | undefined }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-md p-2.5 text-sm ${result.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
    >
      {result.ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span className="[overflow-wrap:anywhere]">
        {result.message}
        {result.ok ? ` (${result.latency_ms} ms${result.version ? `, version ${result.version}` : ""})` : ""}
      </span>
    </p>
  );
}

const num = (value: string | undefined) => (value && value.trim() !== "" ? Number(value) : undefined);

/**
 * Adds or edits a solver (a service that gets past browser challenges for the plugins). "Test"
 * asks the server to try it before anything is saved.
 */
export function SolverDialog({ solver, owner, onClose }: { solver?: Solver; owner?: Owner; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const refresh = useNetworkRefresh();
  const fallbackId = useId();
  const [fallback, setFallback] = useState(solver?.as_response_fallback ?? false);
  const done = () => {
    refresh();
    toast.success(solver ? "Solver saved." : "Solver added.");
    onClose();
  };
  const create = $api.useMutation("post", "/network/solvers", { onSuccess: done });
  const update = $api.useMutation("patch", "/network/solvers/{solver_id}", { onSuccess: done });
  const test = $api.useMutation("post", "/network/solvers/test");
  const read = () => {
    const v = formValues(form.current as HTMLFormElement);
    const ttl = num(v.session_ttl_seconds);
    const timeout = num(v.max_timeout_seconds);
    return {
      name: v.name ?? "",
      type: (v.type ?? "flaresolverr") as Solver["type"],
      url: v.url ?? "",
      ...(ttl !== undefined ? { session_ttl_seconds: ttl } : {}),
      ...(timeout !== undefined ? { max_timeout_seconds: timeout } : {}),
      as_response_fallback: fallback,
    };
  };
  const error = create.error ?? update.error;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{solver ? `Edit ${solver.name}` : "Add a solver"}</DialogTitle>
          <DialogDescription>
            A FlareSolverr-compatible service that gets past browser challenges. Only profiles that name it use it.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={form}
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const body = read();
            if (solver) update.mutate({ params: { path: { solver_id: solver.id } }, body });
            else {
              const id = formValues(event.currentTarget).id ?? "";
              create.mutate({ body: { id, ...body, ...(owner ? { owner } : {}) } });
            }
          }}
        >
          {error ? <ErrorAlert error={error} title="Not saved" /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {solver ? null : (
              <TextField
                label="ID"
                name="id"
                required
                pattern={ID_PATTERN}
                hint="Lowercase; it can't change."
                error={error}
              />
            )}
            <TextField label="Name" name="name" required defaultValue={solver?.name} error={error} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Type">
              {(props) => (
                <NativeSelect name="type" defaultValue={solver?.type ?? "flaresolverr"} {...props}>
                  <option value="flaresolverr">FlareSolverr</option>
                  <option value="byparr">Byparr</option>
                </NativeSelect>
              )}
            </Field>
            <TextField
              label="URL"
              name="url"
              type="url"
              required
              placeholder="http://flaresolverr:8191"
              defaultValue={solver?.url}
              error={error}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Session lifetime (s)"
              name="session_ttl_seconds"
              type="number"
              min={0}
              defaultValue={solver?.session_ttl_seconds}
              hint="Optional."
            />
            <TextField
              label="Longest wait (s)"
              name="max_timeout_seconds"
              type="number"
              min={1}
              defaultValue={solver?.max_timeout_seconds}
              hint="Optional."
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={fallbackId} className="font-normal">
              Use the solver's answer as the page itself
            </Label>
            <Switch id={fallbackId} checked={fallback} onCheckedChange={setFallback} />
          </div>
          <TestResult result={test.data} />
          {test.error ? <ErrorAlert error={test.error} title="Not tested" /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => {
                if (!form.current?.reportValidity()) return;
                test.mutate({ body: { id: solver?.id ?? "test", ...read() } });
              }}
            >
              {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Test
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {solver ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Adds or edits a proxy (HTTP or SOCKS5, e.g. a VPN container). Its password is never shown:
 * left empty, it stays as it is. "Test" connects to it, or fetches a page through it.
 */
export function ProxyDialog({ proxy, owner, onClose }: { proxy?: NetworkProxy; owner?: Owner; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const refresh = useNetworkRefresh();
  const done = () => {
    refresh();
    toast.success(proxy ? "Proxy saved." : "Proxy added.");
    onClose();
  };
  const create = $api.useMutation("post", "/network/proxies", { onSuccess: done });
  const update = $api.useMutation("patch", "/network/proxies/{proxy_id}", { onSuccess: done });
  const test = $api.useMutation("post", "/network/proxies/test");
  const error = create.error ?? update.error;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{proxy ? `Edit ${proxy.name}` : "Add a proxy"}</DialogTitle>
          <DialogDescription>
            An HTTP or SOCKS5 proxy, e.g. a VPN container. Only profiles that name it use it.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={form}
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const v = formValues(event.currentTarget);
            const common = { name: v.name ?? "", url: v.url ?? "" };
            if (proxy) {
              update.mutate({
                params: { path: { proxy_id: proxy.id } },
                // An empty user removes the credentials; an empty password keeps it.
                body: { ...common, username: v.username ?? "", ...(v.password ? { password: v.password } : {}) },
              });
            } else {
              create.mutate({
                body: {
                  id: v.id ?? "",
                  ...common,
                  ...(v.username ? { username: v.username } : {}),
                  ...(v.password ? { password: v.password } : {}),
                  ...(owner ? { owner } : {}),
                },
              });
            }
          }}
        >
          {error ? <ErrorAlert error={error} title="Not saved" /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {proxy ? null : (
              <TextField
                label="ID"
                name="id"
                required
                pattern={ID_PATTERN}
                hint="Lowercase; it can't change."
                error={error}
              />
            )}
            <TextField label="Name" name="name" required defaultValue={proxy?.name} error={error} />
          </div>
          <TextField
            label="URL"
            name="url"
            required
            placeholder="socks5://proxy:1080"
            pattern="(https?|socks5)://.+"
            defaultValue={proxy?.url}
            hint="http://, https:// or socks5://, without a user or password in it."
            error={error}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="User"
              name="username"
              autoComplete="off"
              defaultValue={proxy?.username}
              hint={proxy ? "Empty removes the credentials." : "Optional."}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              hint={proxy?.has_password ? "Set. Leave empty to keep it." : "Optional."}
            />
          </div>
          <TextField
            label="Test with a page (optional)"
            name="test_url"
            type="url"
            placeholder="https://example.com"
            hint="Without one, the test only connects to the proxy."
          />
          <TestResult result={test.data} />
          {test.error ? <ErrorAlert error={test.error} title="Not tested" /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => {
                if (!form.current?.reportValidity()) return;
                const v = formValues(form.current);
                test.mutate({
                  body: {
                    proxy: {
                      id: proxy?.id ?? v.id ?? "test",
                      name: v.name ?? "",
                      url: v.url ?? "",
                      ...(v.username ? { username: v.username } : {}),
                      ...(v.password ? { password: v.password } : {}),
                    },
                    ...(v.test_url ? { url: v.test_url } : {}),
                  },
                });
              }}
            >
              {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Test
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {proxy ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type UserAgentMode = S["NetworkUserAgent"]["mode"];

/**
 * Adds or edits a network profile: which proxy and solver, how fast, as what browser. Saving
 * replaces every setting; anything left empty is the plugin's own.
 */
export function ProfileDialog({
  profile,
  owner,
  solvers,
  proxies,
  onClose,
  onCreated,
}: {
  profile?: Profile;
  /** Custom to this plugin, extension, source or provider. */
  owner?: Owner;
  solvers: readonly Solver[];
  proxies: readonly NetworkProxy[];
  onClose: () => void;
  onCreated?: (profile: Profile) => void;
}) {
  const refresh = useNetworkRefresh();
  const create = $api.useMutation("post", "/network/profiles", {
    onSuccess: (created) => {
      refresh();
      toast.success("Profile added.");
      onCreated?.(created);
      onClose();
    },
  });
  const update = $api.useMutation("put", "/network/profiles/{profile_id}", {
    onSuccess: () => {
      refresh();
      toast.success("Profile saved.");
      onClose();
    },
  });
  const [solver, setSolver] = useState(profile?.solver_id ?? "");
  const [limited, setLimited] = useState(profile?.rate_limit !== undefined);
  const [mode, setMode] = useState<UserAgentMode>(profile?.user_agent.mode ?? "default");
  const [headers, setHeaders] = useState<Array<[string, string]>>(Object.entries(profile?.headers ?? {}));
  const limitedId = useId();
  const error = create.error ?? update.error;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{profile ? `Edit ${profile.name}` : owner ? "New custom profile" : "Add a profile"}</DialogTitle>
          <DialogDescription>
            {owner
              ? "Only for this one; it isn't offered anywhere else."
              : "Shared: offered to every plugin. Nothing uses it until it's assigned."}{" "}
            Anything left empty is the plugin's own setting.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const v = formValues(event.currentTarget);
            const requests = num(v.requests);
            const period = num(v.period_seconds);
            const burst = num(v.burst);
            const concurrency = num(v.concurrency);
            const timeouts = {
              ...(num(v.connect_seconds) !== undefined ? { connect_seconds: num(v.connect_seconds) as number } : {}),
              ...(num(v.read_seconds) !== undefined ? { read_seconds: num(v.read_seconds) as number } : {}),
              ...(num(v.call_seconds) !== undefined ? { call_seconds: num(v.call_seconds) as number } : {}),
            };
            const settings: S["NetworkProfileSettings"] = {
              name: v.name ?? "",
              ...(v.proxy_id ? { proxy_id: v.proxy_id } : {}),
              ...(solver ? { solver_id: solver } : {}),
              ...(limited && requests !== undefined && period !== undefined
                ? {
                    rate_limit: {
                      requests,
                      period_seconds: period,
                      ...(burst !== undefined ? { burst } : {}),
                      scope: (v.scope ?? "source") as "source" | "host",
                    },
                  }
                : {}),
              ...(concurrency !== undefined ? { concurrency } : {}),
              user_agent: { mode, ...(mode === "fixed" ? { value: v.user_agent ?? "" } : {}) },
              ...(v.doh_url ? { doh_url: v.doh_url } : {}),
              headers: Object.fromEntries(headers.filter(([name]) => name.trim() !== "")),
              ...(v.shared_cookie_jar ? { shared_cookie_jar: v.shared_cookie_jar } : {}),
              timeouts,
            };
            if (profile) update.mutate({ params: { path: { profile_id: profile.id } }, body: settings });
            else create.mutate({ body: { id: v.id ?? "", ...settings, ...(owner ? { owner } : {}) } });
          }}
        >
          {error ? <ErrorAlert error={error} title="Not saved" /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {profile ? null : (
              <TextField
                label="ID"
                name="id"
                required
                pattern={ID_PATTERN}
                hint="Lowercase; it can't change."
                error={error}
              />
            )}
            <TextField label="Name" name="name" required defaultValue={profile?.name} error={error} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proxy">
              {(props) => (
                <NativeSelect name="proxy_id" defaultValue={profile?.proxy_id ?? ""} {...props}>
                  <option value="">None (direct)</option>
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.owner ? " (custom)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Solver">
              {(props) => (
                <NativeSelect value={solver} onChange={(e) => setSolver(e.target.value)} {...props}>
                  <option value="">None</option>
                  {solvers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.owner ? " (custom)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <fieldset className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={limitedId}>Rate limit</Label>
              <Switch id={limitedId} checked={limited} onCheckedChange={setLimited} />
            </div>
            {limited ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <TextField
                  label="Requests"
                  name="requests"
                  type="number"
                  min={1}
                  required
                  defaultValue={profile?.rate_limit?.requests ?? 30}
                />
                <TextField
                  label="Per (s)"
                  name="period_seconds"
                  type="number"
                  min={0.001}
                  step="any"
                  required
                  defaultValue={profile?.rate_limit?.period_seconds ?? 60}
                />
                <TextField label="Burst" name="burst" type="number" min={0} defaultValue={profile?.rate_limit?.burst} />
                <Field label="For each">
                  {(props) => (
                    <NativeSelect name="scope" defaultValue={profile?.rate_limit?.scope ?? "source"} {...props}>
                      <option value="source">Source</option>
                      <option value="host">Site</option>
                    </NativeSelect>
                  )}
                </Field>
              </div>
            ) : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="At once"
              name="concurrency"
              type="number"
              min={1}
              defaultValue={profile?.concurrency}
              hint="Requests in parallel."
            />
            <Field label="Browser (user agent)">
              {(props) => (
                <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as UserAgentMode)} {...props}>
                  <option value="default">The plugin's</option>
                  <option value="fixed">This one…</option>
                  <option value="random_desktop">A random desktop browser</option>
                  <option value="from_solver" disabled={!solver}>
                    The solver's{solver ? "" : " (needs a solver)"}
                  </option>
                </NativeSelect>
              )}
            </Field>
          </div>
          {mode === "fixed" ? (
            <TextField label="User agent" name="user_agent" required defaultValue={profile?.user_agent.value} />
          ) : null}
          <TextField
            label="DNS over HTTPS"
            name="doh_url"
            type="url"
            placeholder="https://dns.example/dns-query"
            defaultValue={profile?.doh_url}
            hint="Optional."
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Extra headers</legend>
            {headers.map(([name, value], index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity; the inputs are controlled
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Header ${index + 1} name`}
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setHeaders(headers.map((h, i) => (i === index ? [e.target.value, h[1]] : h)))}
                />
                <Input
                  aria-label={`Header ${index + 1} value`}
                  placeholder="Value"
                  value={value}
                  onChange={(e) => setHeaders(headers.map((h, i) => (i === index ? [h[0], e.target.value] : h)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove header ${index + 1}`}
                  onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setHeaders([...headers, ["", ""]])}>
                <Plus aria-hidden />
                Add a header
              </Button>
            </div>
          </fieldset>
          <TextField
            label="Shared cookie jar"
            name="shared_cookie_jar"
            maxLength={100}
            defaultValue={profile?.shared_cookie_jar}
            hint="Optional: sources whose profiles name the same jar share cookies (e.g. one login). Empty: each source keeps its own."
          />
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-medium">Timeouts (s)</legend>
            <TextField
              label="Connect"
              name="connect_seconds"
              type="number"
              min={0}
              step="any"
              defaultValue={profile?.timeouts.connect_seconds}
            />
            <TextField
              label="Read"
              name="read_seconds"
              type="number"
              min={0}
              step="any"
              defaultValue={profile?.timeouts.read_seconds}
            />
            <TextField
              label="Whole call"
              name="call_seconds"
              type="number"
              min={0}
              step="any"
              defaultValue={profile?.timeouts.call_seconds}
            />
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {profile ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
