// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { NativeSelect } from "@/components/native-select";
import { AllOnOff } from "@/components/schema-form";
import { ErrorAlert } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { formatVersion } from "@/lib/version";
import { PackageActions, PackageFacts } from "./package-parts";
import type { Package } from "./packages";
import { type PackageTasks, patchPackage } from "./use-package-tasks";

/** A package's details: where it comes from, its languages and the sources it provides. */
export function PackageSheet({
  pluginId,
  pkg,
  tasks,
  onOpenChange,
}: {
  pluginId: string;
  pkg: Package | undefined;
  tasks: PackageTasks;
  onOpenChange: (open: boolean) => void;
}) {
  const desktop = useIsDesktop();
  return (
    <Sheet open={pkg !== undefined} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0", desktop ? "w-full sm:max-w-md" : "max-h-[85dvh] rounded-t-2xl pb-safe")}
      >
        {/* Keyed, so what's picked for one package doesn't carry over to the next. */}
        {pkg ? <Details key={pkg.id} pluginId={pluginId} pkg={pkg} tasks={tasks} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Details({ pluginId, pkg, tasks }: { pluginId: string; pkg: Package; tasks: PackageTasks }) {
  const [origin, setOrigin] = useState("");
  return (
    <>
      <SheetHeader>
        <SheetTitle className="[overflow-wrap:anywhere]">{pkg.name}</SheetTitle>
        <SheetDescription className="[overflow-wrap:anywhere]">{pkg.id}</SheetDescription>
        <PackageFacts pkg={pkg} />
      </SheetHeader>
      <div className="grid flex-1 content-start gap-6 overflow-y-auto px-4 pb-6">
        {pkg.error ? <p className="text-sm text-destructive [overflow-wrap:anywhere]">{pkg.error}</p> : null}
        <section className="grid gap-2" aria-label="Where it comes from">
          <h3 className="text-sm font-medium">Offered by</h3>
          <ul className="grid gap-1 text-sm">
            {pkg.offers.map((offer) => (
              <li key={offer.origin_id} className="flex flex-wrap items-center gap-2">
                <span className="[overflow-wrap:anywhere]">{offer.origin_name}</span>
                <span className="text-muted-foreground tabular-nums">{formatVersion(offer.version)}</span>
                {offer.supported ? null : <Badge variant="outline">Unsupported</Badge>}
              </li>
            ))}
          </ul>
          {!pkg.installed && pkg.offers.length > 1 ? (
            <NativeSelect aria-label="Install from" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">The best offer</option>
              {pkg.offers.map((offer) => (
                <option key={offer.origin_id} value={offer.origin_id} disabled={!offer.supported}>
                  {offer.origin_name} ({formatVersion(offer.version)})
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <PackageActions pkg={pkg} tasks={tasks} {...(origin ? { originId: origin } : {})} />
        </section>
        {pkg.langs.length > 1 ? (
          // Keyed by what's saved, so the form starts over once a save comes back.
          <LanguagesForm key={pkg.enabled_langs.join()} pluginId={pluginId} pkg={pkg} />
        ) : null}
        <section className="grid gap-2" aria-label="Its sources">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Sources</h3>
            {pkg.installed ? (
              <Link
                to="/admin/sources"
                search={{ plugin: pluginId, package: pkg.id }}
                className="text-sm underline-offset-4 hover:underline"
              >
                Open in Sources
              </Link>
            ) : null}
          </div>
          <ul className="divide-y rounded-lg border text-sm">
            {pkg.sources.map((source) => (
              <li key={source.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{source.name}</span>
                <Badge variant="outline" className="uppercase">
                  {source.lang}
                </Badge>
                {source.available ? null : <Badge variant="secondary">Not available</Badge>}
              </li>
            ))}
          </ul>
          {pkg.sources.some((s) => !s.available) ? (
            <p className="text-xs text-muted-foreground">
              Not available: its language is turned off for this extension or the plugin.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

/**
 * Which of its languages this package offers. All of them is saved as an empty list, so a
 * language the store adds later is on too.
 */
function LanguagesForm({ pluginId, pkg }: { pluginId: string; pkg: Package }) {
  const id = useId();
  const queryClient = useQueryClient();
  const saved = pkg.enabled_langs.length === 0 ? pkg.langs : pkg.enabled_langs;
  const [chosen, setChosen] = useState<string[]>(saved);
  const save = $api.useMutation("put", "/plugins/{plugin_id}/packages/{package_id}/languages", {
    onSuccess: (saved) => {
      toast.success("Languages saved.");
      // The answer is the package as it now is: no need to reload the whole list.
      patchPackage(queryClient, pluginId, saved);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === "/sources" });
    },
  });
  const all = pkg.langs.every((lang) => chosen.includes(lang));
  const changed = all ? pkg.enabled_langs.length !== 0 : chosen.slice().sort().join() !== saved.slice().sort().join();
  return (
    <form
      className="grid gap-2"
      aria-label="Languages"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          params: { path: { plugin_id: pluginId, package_id: pkg.id } },
          body: { enabled_langs: all ? [] : chosen },
        });
      }}
    >
      <h3 className="text-sm font-medium">Languages</h3>
      <p className="-mt-1 text-xs text-muted-foreground">
        Only sources in these languages are offered. The plugin's own languages apply too.
      </p>
      {/* All on is saved as "all", so languages the store adds later are on too. */}
      <AllOnOff label="Languages" onAll={(on) => setChosen(on ? [...pkg.langs] : [])} />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {pkg.langs.map((lang) => (
          <div key={lang} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${lang}`}
              checked={chosen.includes(lang)}
              onCheckedChange={(checked) =>
                setChosen(checked ? [...chosen, lang] : chosen.filter((other) => other !== lang))
              }
            />
            <Label htmlFor={`${id}-${lang}`} className="font-normal uppercase">
              {lang}
            </Label>
          </div>
        ))}
      </div>
      {save.error ? <ErrorAlert error={save.error} title="Not saved" /> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={!changed || chosen.length === 0 || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save languages
        </Button>
        {chosen.length === 0 ? <span className="text-xs text-muted-foreground">Pick at least one.</span> : null}
      </div>
    </form>
  );
}
