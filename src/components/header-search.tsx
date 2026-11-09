// SPDX-License-Identifier: GPL-3.0-or-later

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Search in a page's title row. Desktops show the field; phones a search icon that opens it in
 * the row (as native apps do), so it doesn't take a row of its own. A query keeps it open; ✕
 * closes it and clears the query. On desktops the field has the usual clear ✕ and Escape.
 */
export function HeaderSearch({
  value,
  onChange,
  label,
  onOpenChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The field's name and placeholder, e.g. "Search your library". */
  label: string;
  /** Told whether the field takes the row on a phone (to hide the title meanwhile). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const desktop = useIsDesktop();
  const [opened, setOpened] = useState(false);
  const open = desktop || opened || value !== "";
  const phoneOpen = !desktop && open;
  useEffect(() => onOpenChange?.(phoneOpen), [phoneOpen, onOpenChange]);
  if (!open) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setOpened(true)}>
        <Search aria-hidden />
      </Button>
    );
  }
  return (
    <div className={cn("relative min-w-0 flex-1 md:w-72 md:flex-none", className)}>
      <SearchInput
        icon
        // Phones close the field with their own ✕ (clearing it too); desktops clear with one.
        clearable={desktop}
        aria-label={label}
        placeholder={label}
        // Opened by a tap: ready to type.
        autoFocus={!desktop && value === ""}
        inputClassName={cn(!desktop && "pr-9")}
        value={value}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !desktop) {
            onChange("");
            setOpened(false);
          }
        }}
      />
      {desktop ? null : (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close the search"
          className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
          onClick={() => {
            onChange("");
            setOpened(false);
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
