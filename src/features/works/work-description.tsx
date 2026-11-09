// SPDX-License-Identifier: GPL-3.0-or-later

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { $api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { descriptionParagraphs, pickDescription } from "@/lib/description";
import { cn } from "@/lib/utils";

/** A first paragraph longer than this is clamped too, so it gets More. */
const LONG = 240;

/**
 * The work's description and genres, from its catalogue entry (the same query as the entry's
 * page, so one visit fills both). Collapsed to the first paragraph with More / Less. The
 * metadata service is optional: while it answers, or if it fails or isn't set up, there's
 * nothing here and the rest of the page doesn't wait for it.
 */
export function WorkDescription({ entryId }: { entryId: string }) {
  const entry = $api.useQuery("get", "/catalog/entries/{entry_id}", { params: { path: { entry_id: entryId } } });
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const paragraphs = useMemo(() => {
    const description = entry.data ? pickDescription(entry.data.descriptions) : undefined;
    return description ? descriptionParagraphs(description) : [];
  }, [entry.data]);
  const genres = entry.data?.genres ?? [];
  if (paragraphs.length === 0 && genres.length === 0) return null;

  const [first = "", ...rest] = paragraphs;
  const collapsible = rest.length > 0 || first.length > LONG;
  const shown = expanded ? paragraphs : paragraphs.slice(0, 1);
  return (
    <section aria-label="Description" className="mb-4 grid max-w-prose gap-2 sm:mb-6">
      {shown.length > 0 ? (
        <div id={id} className="grid gap-2 text-sm leading-relaxed text-muted-foreground">
          {shown.map((paragraph, i) => (
            <p
              key={i}
              className={cn("whitespace-pre-line [overflow-wrap:anywhere]", !expanded && collapsible && "line-clamp-3")}
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
      {collapsible ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-self-start p-0"
          // Named apart from the page's other "More" (the chapters' menu), starting with what it shows.
          aria-label={expanded ? "Less of the description" : "More of the description"}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Less" : "More"}
          {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
      ) : null}
      {genres.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Genres">
          {genres.map((genre) => (
            <li key={genre}>
              <Badge variant="secondary">{genre}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
