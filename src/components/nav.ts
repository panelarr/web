// SPDX-License-Identifier: GPL-3.0-or-later

import { Compass, Download, History, LibraryBig, type LucideIcon, Settings, Shield } from "lucide-react";

export interface NavItem {
  to: "/" | "/history" | "/browse" | "/downloads" | "/settings" | "/admin";
  label: string;
  icon: LucideIcon;
  /** Shown in the phone's bottom bar; the rest live under "More". */
  primary: boolean;
  /** Only for admins. */
  admin?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Library", icon: LibraryBig, primary: true },
  { to: "/history", label: "History", icon: History, primary: true },
  { to: "/browse", label: "Browse", icon: Compass, primary: true },
  { to: "/downloads", label: "Downloads", icon: Download, primary: false },
  { to: "/settings", label: "Settings", icon: Settings, primary: false },
  { to: "/admin", label: "Admin", icon: Shield, primary: false, admin: true },
];
