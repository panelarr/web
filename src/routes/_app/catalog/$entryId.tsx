// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { $api } from "@/api/client";
import { isApiError } from "@/api/errors";
import type { components } from "@/api/schema.gen";
import { useMe } from "@/auth/session";
import { EmptyState, ErrorAlert, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cover } from "@/features/catalog/cover";
import { label, STATUS_LABELS, TYPE_LABELS } from "@/features/catalog/labels";
import { LIBRARY_INDEX_KEY } from "@/features/catalog/library-index";
import { RefreshEntryButton } from "@/features/meta/refresh-entry";
import { descriptionParagraphs, pickDescription } from "@/lib/description";

type Entry = components["schemas"]["CatalogEntry"];

export const Route = createFileRoute("/_app/catalog/$entryId")({
  component: EntryPage,
});

function EntryPage() {
  const { entryId } = Route.useParams();
  const router = useRouter();
  const entry = $api.useQuery("get", "/catalog/entries/{entry_id}", { params: { path: { entry_id: entryId } } });
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.history.back()}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
        {entry.data ? <RefreshEntryButton entryId={entry.data.id} /> : null}
      </div>
      {isApiError(entry.error, "not_found") ? (
        <EmptyState title="Not in the catalogue">This entry doesn't exist, or you can't see it.</EmptyState>
      ) : entry.error ? (
        <ErrorAlert error={entry.error} onRetry={() => void entry.refetch()} />
      ) : null}
      {entry.isPending ? <Loading /> : null}
      {entry.data ? <EntryDetails entry={entry.data} /> : null}
    </>
  );
}

function EntryDetails({ entry }: { entry: Entry }) {
  const description = pickDescription(entry.descriptions);
  const others = entry.titles.filter((t) => t.text !== entry.title);
  const people = groupCredits(entry.credits);
  const years = entry.year
    ? entry.end_year && entry.end_year !== entry.year
      ? `${entry.year}–${entry.end_year}`
      : String(entry.year)
    : undefined;

  return (
    <article className="grid gap-8 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="mx-auto w-44 sm:w-52 md:mx-0 md:w-full">
        <Cover url={entry.cover?.url} title={entry.title} eager className="shadow-md" />
        <div className="mt-4 hidden md:block">
          <AddButton entry={entry} />
        </div>
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{entry.title}</h1>
        {others.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {others
              .slice(0, 3)
              .map((t) => t.text)
              .join(" · ")}
          </p>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {[label(TYPE_LABELS, entry.type), years, label(STATUS_LABELS, entry.status)].filter(Boolean).join(" · ")}
          {entry.content_rating !== "safe" && entry.content_rating !== "unknown" ? (
            <Badge variant="outline">{entry.content_rating}</Badge>
          ) : null}
        </p>
        {people.length > 0 ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {people.map(([role, names]) => (
              <div key={role} className="contents">
                <dt className="text-muted-foreground capitalize">{role.replaceAll("_", " ")}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">{names.join(", ")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="mt-5 md:hidden">
          <AddButton entry={entry} />
        </div>
        {entry.genres.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Genres">
            {entry.genres.map((genre) => (
              <li key={genre}>
                <Badge variant="secondary">{genre}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {description ? (
          <section aria-label="Description" className="mt-5 grid max-w-prose gap-3 text-sm leading-relaxed">
            {descriptionParagraphs(description).map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}
        <Tags entry={entry} />
        <AllTitles entry={entry} />
        {entry.links.length > 0 ? (
          <section aria-labelledby="links" className="mt-6">
            <h2 id="links" className="mb-2 text-sm font-medium">
              Links
            </h2>
            <ul className="flex flex-wrap gap-2">
              {entry.links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm hover:bg-accent"
                  >
                    {link.title || link.type}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Attribution entry={entry} />
      </div>
    </article>
  );
}

function AddButton({ entry }: { entry: Entry }) {
  const { user } = useMe();
  const queryClient = useQueryClient();
  const add = $api.useMutation("post", "/library", {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_INDEX_KEY });
      // The catalogue now marks the entry as in the library.
      void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[1]).startsWith("/catalog") });
      void queryClient.invalidateQueries({ queryKey: $api.queryOptions("get", "/library").queryKey.slice(0, 2) });
      toast.success(`Added ${entry.title}. Looking for it on your sources…`);
    },
  });
  const workId = entry.library_work_id ?? add.data?.work.id;
  const mayAdd = user.role === "admin" || user.grants.may_add;

  if (workId) {
    return (
      <Link
        to="/works/$workId"
        params={{ workId }}
        className="flex h-10 items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15 md:w-full"
      >
        <Check className="size-4" aria-hidden />
        In your library
      </Link>
    );
  }
  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        className="w-full"
        disabled={!mayAdd || add.isPending}
        onClick={() => add.mutate({ body: { entry_id: entry.id } })}
      >
        {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Add to library
      </Button>
      {mayAdd ? null : <p className="text-xs text-muted-foreground">You may not add works. Ask your admin.</p>}
      {add.error ? <ErrorAlert error={add.error} title="Not added" /> : null}
    </div>
  );
}

function groupCredits(credits: Entry["credits"]): Array<[string, string[]]> {
  const roles = new Map<string, string[]>();
  for (const credit of credits) roles.set(credit.role, [...(roles.get(credit.role) ?? []), credit.name]);
  return [...roles.entries()];
}

function Tags({ entry }: { entry: Entry }) {
  const [spoilers, setSpoilers] = useState(false);
  const tags = entry.tags.filter((tag) => !tag.genre);
  if (tags.length === 0) return null;
  const hidden = tags.filter((tag) => tag.spoiler).length;
  return (
    <section aria-labelledby="tags" className="mt-6">
      <h2 id="tags" className="mb-2 text-sm font-medium">
        Tags
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {tags
          .filter((tag) => spoilers || !tag.spoiler)
          .map((tag) => (
            <li key={tag.name}>
              <Badge variant="outline" className={tag.spoiler ? "border-warning/60" : undefined}>
                {tag.name}
              </Badge>
            </li>
          ))}
        {hidden > 0 ? (
          <li>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => setSpoilers(!spoilers)}
            >
              {spoilers ? "Hide spoilers" : `Show ${hidden} spoiler ${hidden === 1 ? "tag" : "tags"}`}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function AllTitles({ entry }: { entry: Entry }) {
  if (entry.titles.length < 2) return null;
  return (
    <details className="mt-6 text-sm">
      <summary className="cursor-pointer font-medium">All titles ({entry.titles.length})</summary>
      <ul className="mt-2 grid gap-1">
        {entry.titles.map((title, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 [overflow-wrap:anywhere]">
            <span>{title.text}</span>
            <span className="text-xs text-muted-foreground">
              {[title.language, title.kind].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Attribution({ entry }: { entry: Entry }) {
  if (entry.attribution.length === 0) return null;
  return (
    <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
      {entry.attribution.map((a) => (
        <p key={a.provider} className="[overflow-wrap:anywhere]">
          Data from{" "}
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
              {a.provider}
            </a>
          ) : (
            a.provider
          )}
          {a.license ? (
            <>
              {" · "}
              {a.license_url ? (
                <a
                  href={a.license_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-2"
                >
                  {a.license}
                </a>
              ) : (
                a.license
              )}
            </>
          ) : null}
          {a.notice ? ` · ${a.notice}` : null}
        </p>
      ))}
    </footer>
  );
}
