// SPDX-License-Identifier: GPL-3.0-or-later

import { Search, X } from "lucide-react";
import { type ComponentProps, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A search field with one way to clear it everywhere: a ✕ that shows only while there's text
 * (clears and puts the cursor back in the field) and Escape. The browser's own clear button is
 * hidden, so WebKit doesn't draw a second one.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  icon = false,
  clearable = true,
  className,
  inputClassName,
  onKeyDown,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  /** Called after a clear (✕ or Escape), for anything beyond `onChange("")`. */
  onClear?: () => void;
  /** A magnifier at the start of the field. */
  icon?: boolean;
  /** Draw the ✕ (and clear on Escape); off where the caller has its own close button. */
  clearable?: boolean;
  /** Classes for the wrapper (width, flex). */
  className?: string;
  /** Classes for the field itself (height). */
  inputClassName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange("");
    onClear?.();
  };
  const showClear = clearable && value !== "";
  return (
    <div className={cn("relative min-w-0", className)}>
      {icon ? (
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <Input
        ref={ref}
        type="search"
        {...props}
        className={cn(
          "[&::-webkit-search-cancel-button]:appearance-none",
          icon && "pl-9",
          clearable && "pr-9",
          inputClassName,
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || !clearable) return;
          if (e.key === "Escape" && value !== "") {
            e.preventDefault();
            clear();
          }
        }}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => {
            clear();
            ref.current?.focus();
          }}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
