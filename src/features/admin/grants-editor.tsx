// SPDX-License-Identifier: GPL-3.0-or-later

import { useId, useMemo, useState } from "react";
import { $api } from "@/api/client";
import type { components } from "@/api/schema.gen";
import { Field } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { SearchInput } from "@/components/search-input";
import { ErrorAlert } from "@/components/states";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CONTENT_RATINGS, type ContentRating, type Grants } from "./grants";

type Source = components["schemas"]["SourceInfo"];

const PERMISSIONS: ReadonlyArray<{
  key: "may_add" | "may_download" | "may_manage_matches";
  label: string;
  hint: string;
}> = [
  { key: "may_add", label: "Add works", hint: "Add works to their library." },
  { key: "may_download", label: "Download chapters", hint: "Queue downloads to the shared library." },
  {
    key: "may_manage_matches",
    label: "Fix matches",
    hint: "Fix source matches, pin chapter variants and set source priorities, for everyone.",
  },
];

/** Edits what a user (or an invite's future user) may do. */
export function GrantsEditor({
  value,
  onChange,
  isAdmin = false,
}: {
  value: Grants;
  onChange: (grants: Grants) => void;
  /** Admins may do everything whatever their grants say; the grants apply if they are demoted. */
  isAdmin?: boolean;
}) {
  const allSourcesId = useId();
  return (
    <div className="grid gap-5">
      {isAdmin ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Admins may do everything. These grants apply if the account becomes a user.
        </p>
      ) : null}
      <div className="grid gap-4">
        {PERMISSIONS.map((permission) => (
          <PermissionSwitch
            key={permission.key}
            label={permission.label}
            hint={permission.hint}
            checked={value[permission.key]}
            onChange={(checked) => onChange({ ...value, [permission.key]: checked })}
          />
        ))}
      </div>
      <Field label="Content up to" hint="Works rated above this are hidden everywhere: search, browse and library.">
        {(aria) => (
          <NativeSelect
            {...aria}
            value={value.content_rating_ceiling}
            onChange={(e) => onChange({ ...value, content_rating_ceiling: e.target.value as ContentRating })}
          >
            {CONTENT_RATINGS.map((rating) => (
              <option key={rating.id} value={rating.id}>
                {rating.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor={allSourcesId}>All sources</Label>
            <p className="text-xs text-muted-foreground">Including sources added later. Turn off to pick sources.</p>
          </div>
          <Switch
            id={allSourcesId}
            checked={value.all_sources}
            onCheckedChange={(checked) => onChange({ ...value, all_sources: checked })}
          />
        </div>
        {value.all_sources ? null : (
          <SourcePicker
            selected={value.allowed_sources}
            onChange={(allowed_sources) => onChange({ ...value, allowed_sources })}
          />
        )}
      </div>
    </div>
  );
}

function PermissionSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Picks sources from every source the server knows, grouped by plugin. */
export function SourcePicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const sources = $api.useQuery("get", "/sources", { params: { query: { all: true } } });
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const byPlugin = new Map<string, Source[]>();
    for (const source of sources.data?.sources ?? []) {
      if (needle && !`${source.name} ${source.lang} ${source.id}`.toLowerCase().includes(needle)) continue;
      byPlugin.set(source.plugin_id, [...(byPlugin.get(source.plugin_id) ?? []), source]);
    }
    return [...byPlugin.entries()];
  }, [sources.data, filter]);

  if (sources.error) return <ErrorAlert error={sources.error} onRetry={() => void sources.refetch()} />;
  const total = sources.data?.sources.length ?? 0;
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder="Filter sources"
          aria-label="Filter sources"
          value={filter}
          onChange={setFilter}
          className="flex-1 basis-40"
          inputClassName="h-8"
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {selected.length} of {total} allowed
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            {total === 0 ? "No sources yet." : "No source matches."}
          </p>
        ) : null}
        {groups.map(([plugin, list]) => (
          <fieldset key={plugin} className="py-1">
            <legend className="px-1 py-1 text-xs font-medium text-muted-foreground">{plugin}</legend>
            {list.map((source) => (
              <div key={source.id} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-accent">
                <Checkbox
                  id={`source-${source.id}`}
                  checked={selected.includes(source.id)}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...selected, source.id] : selected.filter((id) => id !== source.id))
                  }
                />
                <Label htmlFor={`source-${source.id}`} className="min-w-0 flex-1 font-normal">
                  <span className="truncate">{source.name}</span>
                  <span className="text-xs text-muted-foreground uppercase">{source.lang}</span>
                </Label>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
