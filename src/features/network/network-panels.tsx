// SPDX-License-Identifier: GPL-3.0-or-later

import { Network, Plus, Shield, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { NativeSelect } from "@/components/native-select";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type NetworkProxy,
  type Owner,
  type Profile,
  ProfileDialog,
  ProxyDialog,
  type Solver,
  SolverDialog,
  TestResult,
  useNetworkRefresh,
} from "./network-dialogs";

/** Which items a list shows: the shared ones (optionally with every custom one), or one owner's. */
export type Scope = { owner: Owner } | { custom: boolean };

const query = (scope: Scope) =>
  "owner" in scope
    ? { owner_kind: scope.owner.kind, owner_id: scope.owner.id }
    : scope.custom
      ? { include_custom: true }
      : {};

export function useSolvers(scope: Scope) {
  return $api.useQuery("get", "/network/solvers", { params: { query: query(scope) } });
}
export function useProxies(scope: Scope) {
  return $api.useQuery("get", "/network/proxies", { params: { query: query(scope) } });
}
export function useProfiles(scope: Scope) {
  return $api.useQuery("get", "/network/profiles", { params: { query: query(scope) } });
}

const ownerLabel = (owner: Owner) =>
  `${{ plugin: "plugin", package: "extension", source: "source", provider: "provider" }[owner.kind]} ${owner.id}`;

function Row({
  title,
  owner,
  details,
  actions,
  children,
}: {
  title: string;
  owner?: Owner | undefined;
  details: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-2 font-medium [overflow-wrap:anywhere]">
            {title}
            {owner ? <Badge variant="outline">Custom: {ownerLabel(owner)}</Badge> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{details}</p>
        </div>
        <div className="flex flex-wrap gap-1">{actions}</div>
      </div>
      {children}
    </li>
  );
}

/** Asks before deleting; one in use says where. */
function DeleteButton({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <AlertDialog>
      <Button variant="ghost" size="sm" className="text-destructive" asChild>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Profiles can't use it any more. One still in use can't be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const onError = (error: unknown) => toast.error(errorMessage(error));

export function SolversPanel({ scope }: { scope: Scope }) {
  const list = useSolvers(scope);
  const refresh = useNetworkRefresh();
  const [editing, setEditing] = useState<Solver | "new">();
  const [tested, setTested] = useState<Record<string, components["schemas"]["NetworkTest"]>>({});
  const test = $api.useMutation("post", "/network/solvers/{solver_id}/test", { onError });
  const remove = $api.useMutation("delete", "/network/solvers/{solver_id}", {
    onSuccess: () => {
      refresh();
      toast.success("Solver deleted.");
    },
    onError,
  });
  return (
    <Section
      title="Solvers"
      description="Services that get past browser challenges (FlareSolverr and the like)."
      addLabel="Add a solver"
      onAdd={() => setEditing("new")}
      dialog={
        editing ? (
          <SolverDialog
            {...(editing === "new" ? {} : { solver: editing })}
            {...("owner" in scope ? { owner: scope.owner } : {})}
            onClose={() => setEditing(undefined)}
          />
        ) : null
      }
      error={list.error}
      pending={list.isPending}
      empty={list.data?.solvers.length === 0}
      emptyIcon={<Shield />}
    >
      {list.data?.solvers.map((solver) => (
        <Row
          key={solver.id}
          title={solver.name}
          owner={solver.owner}
          details={`${solver.type === "byparr" ? "Byparr" : "FlareSolverr"} · ${solver.url}`}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(
                    { params: { path: { solver_id: solver.id } } },
                    { onSuccess: (result) => setTested((prev) => ({ ...prev, [solver.id]: result })) },
                  )
                }
              >
                Test
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(solver)}>
                Edit
              </Button>
              <DeleteButton
                name={solver.name}
                onDelete={() => remove.mutate({ params: { path: { solver_id: solver.id } } })}
              />
            </>
          }
        >
          <TestResult result={tested[solver.id]} />
        </Row>
      ))}
    </Section>
  );
}

export function ProxiesPanel({ scope }: { scope: Scope }) {
  const list = useProxies(scope);
  const refresh = useNetworkRefresh();
  const [editing, setEditing] = useState<NetworkProxy | "new">();
  const [tested, setTested] = useState<Record<string, components["schemas"]["NetworkTest"]>>({});
  const test = $api.useMutation("post", "/network/proxies/{proxy_id}/test", { onError });
  const remove = $api.useMutation("delete", "/network/proxies/{proxy_id}", {
    onSuccess: () => {
      refresh();
      toast.success("Proxy deleted.");
    },
    onError,
  });
  return (
    <Section
      title="Proxies"
      description="HTTP or SOCKS5 proxies, such as a VPN container."
      addLabel="Add a proxy"
      onAdd={() => setEditing("new")}
      dialog={
        editing ? (
          <ProxyDialog
            {...(editing === "new" ? {} : { proxy: editing })}
            {...("owner" in scope ? { owner: scope.owner } : {})}
            onClose={() => setEditing(undefined)}
          />
        ) : null
      }
      error={list.error}
      pending={list.isPending}
      empty={list.data?.proxies.length === 0}
      emptyIcon={<Network />}
    >
      {list.data?.proxies.map((proxy) => (
        <Row
          key={proxy.id}
          title={proxy.name}
          owner={proxy.owner}
          details={`${proxy.url}${proxy.username ? ` · user ${proxy.username}` : ""}${proxy.has_password ? " · password set" : ""}`}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(
                    { params: { path: { proxy_id: proxy.id } }, body: {} },
                    { onSuccess: (result) => setTested((prev) => ({ ...prev, [proxy.id]: result })) },
                  )
                }
              >
                Test
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(proxy)}>
                Edit
              </Button>
              <DeleteButton
                name={proxy.name}
                onDelete={() => remove.mutate({ params: { path: { proxy_id: proxy.id } } })}
              />
            </>
          }
        >
          <TestResult result={tested[proxy.id]} />
        </Row>
      ))}
    </Section>
  );
}

/** A profile's settings in a line. */
export function profileSummary(profile: Profile, solvers: readonly Solver[], proxies: readonly NetworkProxy[]): string {
  const name = <T extends { id: string; name: string }>(list: readonly T[], id: string | undefined) =>
    list.find((item) => item.id === id)?.name ?? id;
  const rate = profile.rate_limit;
  return [
    profile.proxy_id ? `via ${name(proxies, profile.proxy_id)}` : "direct",
    profile.solver_id ? `solver ${name(solvers, profile.solver_id)}` : undefined,
    rate ? `${rate.requests} per ${rate.period_seconds}s${rate.scope === "host" ? " per site" : ""}` : undefined,
    profile.concurrency ? `${profile.concurrency} at once` : undefined,
    {
      default: undefined,
      fixed: "fixed browser",
      random_desktop: "random desktop browser",
      from_solver: "solver's browser",
    }[profile.user_agent.mode],
    profile.doh_url ? "DNS over HTTPS" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

const TARGETS = {
  global: "everything",
  plugin: "plugin",
  package: "extension",
  source: "source",
  meta: "the metadata service",
  provider: "provider",
} as const;

export function ProfilesPanel({ scope }: { scope: Scope }) {
  const list = useProfiles(scope);
  // A profile may use the shared solvers and proxies, and an owner's own.
  const solvers = useSolvers({ custom: true });
  const proxies = useProxies({ custom: true });
  const refresh = useNetworkRefresh();
  const [editing, setEditing] = useState<Profile | "new">();
  const remove = $api.useMutation("delete", "/network/profiles/{profile_id}", {
    onSuccess: () => {
      refresh();
      toast.success("Profile deleted.");
    },
    onError,
  });
  const allSolvers = solvers.data?.solvers ?? [];
  const allProxies = proxies.data?.proxies ?? [];
  return (
    <Section
      title="Profiles"
      description="A proxy, a solver, speed limits and a browser, together. Nothing uses a profile until it's assigned."
      addLabel="Add a profile"
      onAdd={() => setEditing("new")}
      dialog={
        editing ? (
          <ProfileDialog
            {...(editing === "new" ? {} : { profile: editing })}
            {...("owner" in scope ? { owner: scope.owner } : {})}
            solvers={usable(allSolvers, editing === "new" ? ownerOf(scope) : editing.owner)}
            proxies={usable(allProxies, editing === "new" ? ownerOf(scope) : editing.owner)}
            onClose={() => setEditing(undefined)}
          />
        ) : null
      }
      error={list.error}
      pending={list.isPending}
      empty={list.data?.profiles.length === 0}
      emptyIcon={<SlidersHorizontal />}
    >
      {list.data?.profiles.map((profile) => (
        <Row
          key={profile.id}
          title={profile.name}
          owner={profile.owner}
          details={
            <>
              {profileSummary(profile, allSolvers, allProxies)}
              <span className="block">
                {profile.assigned_to.length === 0
                  ? "Not assigned."
                  : `Used for ${profile.assigned_to
                      .map((a) => (a.target_id ? `${TARGETS[a.target_kind]} ${a.target_id}` : TARGETS[a.target_kind]))
                      .join(", ")}.`}
              </span>
            </>
          }
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(profile)}>
                Edit
              </Button>
              <DeleteButton
                name={profile.name}
                onDelete={() => remove.mutate({ params: { path: { profile_id: profile.id } } })}
              />
            </>
          }
        />
      ))}
    </Section>
  );
}

const ownerOf = (scope: Scope) => ("owner" in scope ? scope.owner : undefined);

/** The plugin an owner belongs to: a plugin's own items serve its extensions and sources too. */
export function pluginOf(owner: Owner): string | undefined {
  if (owner.kind === "provider") return undefined;
  return owner.kind === "plugin" ? owner.id : owner.id.split(":")[0];
}

/** What a profile with this owner may use: the shared items, and those in its own scope. */
export function usable<T extends { owner?: Owner }>(items: readonly T[], owner: Owner | undefined): T[] {
  return items.filter((item) => {
    if (!item.owner) return true;
    if (!owner) return false;
    if (item.owner.kind === "provider" || owner.kind === "provider") {
      return item.owner.kind === owner.kind && item.owner.id === owner.id;
    }
    return pluginOf(item.owner) === pluginOf(owner);
  });
}

/** The profile used where nothing more specific is assigned. */
export function GlobalDefault() {
  const profiles = useProfiles({ custom: false });
  const assignments = $api.useQuery("get", "/network/assignments");
  const refresh = useNetworkRefresh();
  const current = assignments.data?.assignments.find((a) => a.target_kind === "global");
  const set = $api.useMutation("put", "/network/assignments", { onSuccess: refresh, onError });
  const clear = $api.useMutation("delete", "/network/assignments", { onSuccess: refresh, onError });
  return (
    <div className="grid gap-1.5 rounded-xl border bg-card p-4">
      <label htmlFor="global-profile" className="text-sm font-medium">
        For everything
      </label>
      <p className="text-xs text-muted-foreground">
        Used wherever nothing more specific is chosen (on a plugin, an extension or a source). With none, each plugin
        uses its own settings.
      </p>
      <div className="sm:max-w-sm">
        <NativeSelect
          id="global-profile"
          value={current?.profile_id ?? ""}
          disabled={set.isPending || clear.isPending}
          onChange={(e) =>
            e.target.value
              ? set.mutate({ body: { target_kind: "global", profile_id: e.target.value } })
              : clear.mutate({ params: { query: { target_kind: "global" } } })
          }
        >
          <option value="">None: the plugins' own settings</option>
          {profiles.data?.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  addLabel,
  onAdd,
  error,
  pending,
  empty,
  emptyIcon,
  dialog,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  error: unknown;
  pending: boolean;
  empty: boolean | undefined;
  emptyIcon: ReactNode;
  dialog: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        <Button size="sm" onClick={onAdd}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {pending ? <Loading /> : null}
      {empty ? (
        <EmptyState icon={emptyIcon} title={`No ${title.toLowerCase()} yet`}>
          {addLabel} to offer it here.
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">{children}</ul>
      )}
      {dialog}
    </section>
  );
}
