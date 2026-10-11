// SPDX-License-Identifier: GPL-3.0-or-later

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A long list (hundreds of chapters) that renders only the rows near the screen. Rows are
 * measured, so they may grow (e.g. when expanded).
 */
export function VirtualList<T>({
  items,
  getKey,
  renderItem,
  estimateSize = 64,
  className,
  label,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setOffset(ref.current.getBoundingClientRect().top + window.scrollY);
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan: 8,
    scrollMargin: offset,
    getItemKey: (index) => getKey(items[index] as T),
  });
  const rows = virtualizer.getVirtualItems();
  // Without layout (tests, first paint) show the first rows.
  const shown =
    rows.length > 0
      ? rows
      : items.slice(0, 40).map((_, index) => ({ index, start: 0, key: getKey(items[index] as T) }));
  return (
    <ul
      ref={ref}
      aria-label={label}
      className={cn("relative", className)}
      style={{ height: rows.length > 0 ? virtualizer.getTotalSize() : undefined }}
    >
      {shown.map((row) => (
        <li
          key={row.key}
          data-index={row.index}
          ref={rows.length > 0 ? virtualizer.measureElement : undefined}
          style={
            rows.length > 0
              ? {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                }
              : undefined
          }
        >
          {renderItem(items[row.index] as T, row.index)}
        </li>
      ))}
    </ul>
  );
}
