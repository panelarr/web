// SPDX-License-Identifier: GPL-3.0-or-later

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** "Chrome on macOS", for listing sessions; a short guess, not a fingerprint. */
export function describeUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? (ua.length > 40 ? `${ua.slice(0, 40)}…` : ua);
}
