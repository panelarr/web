// SPDX-License-Identifier: GPL-3.0-or-later

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** Columns for a cover grid at a width: 2 on phones up to 7 on wide screens. */
export function columnsFor(width: number): number {
  if (width >= 1400) return 7;
  if (width >= 1100) return 6;
  if (width >= 860) return 5;
  if (width >= 640) return 4;
  if (width >= 440) return 3;
  return 2;
}

/**
 * A grid of cards that renders only the rows near the screen, so libraries of thousands of
 * works scroll smoothly. Rows are measured, so cards may differ in height.
 */
export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  estimateRowHeight = (columnWidth: number) => columnWidth * 1.5 + 56,
  gap = 16,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateRowHeight?: (columnWidth: number) => number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      setWidth(element.clientWidth);
      setOffset(element.getBoundingClientRect().top + window.scrollY);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = columnsFor(width || 360);
  const columnWidth = width > 0 ? (width - gap * (columns - 1)) / columns : 160;
  const rows = Math.ceil(items.length / columns);
  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => estimateRowHeight(columnWidth) + gap,
    overscan: 3,
    scrollMargin: offset,
  });
  const virtualRows = virtualizer.getVirtualItems();
  // Without layout (tests, first paint) show the first rows.
  const shown =
    virtualRows.length > 0
      ? virtualRows
      : Array.from({ length: Math.min(rows, 6) }, (_, index) => ({ index, start: 0, key: index }));

  return (
    <div
      ref={ref}
      style={{ height: virtualRows.length > 0 ? virtualizer.getTotalSize() : undefined, position: "relative" }}
    >
      {shown.map((row) => (
        <ul
          key={row.key}
          data-index={row.index}
          ref={virtualRows.length > 0 ? virtualizer.measureElement : undefined}
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap,
            paddingBottom: gap,
            ...(virtualRows.length > 0
              ? {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                }
              : {}),
          }}
        >
          {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
            <li key={getKey(item)} className="min-w-0">
              {renderItem(item)}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
