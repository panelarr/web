// SPDX-License-Identifier: GPL-3.0-or-later

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const number = new Intl.NumberFormat();

export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return date.format(new Date(value));
}

export function formatNumber(value: number): string {
  return number.format(value);
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400],
  ["month", 30 * 86_400],
  ["week", 7 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 hours ago", "in 2 days", "now". */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(0, "second");
}
