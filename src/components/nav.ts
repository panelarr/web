// SPDX-License-Identifier: GPL-3.0-or-later

import { Compass, Download, LibraryBig, type LucideIcon, Settings, Shield } from "lucide-react";

export interface NavItem {
  to: "/" | "/browse" | "/downloads" | "/settings" | "/admin";
  label: string;
  icon: LucideIcon;
  /** Shown in the phone's bottom bar; the rest live under "More". */
  primary: boolean;
  /** Only for admins. */
  admin?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Library", icon: LibraryBig, primary: true },
  { to: "/browse", label: "Browse", icon: Compass, primary: true },
  { to: "/downloads", label: "Downloads", icon: Download, primary: true },
  { to: "/settings", label: "Settings", icon: Settings, primary: false },
  { to: "/admin", label: "Admin", icon: Shield, primary: false, admin: true },
];
