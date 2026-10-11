// SPDX-License-Identifier: GPL-3.0-or-later

import { Link } from "@tanstack/react-router";

const link =
  "-mb-px inline-block border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground";

/** Browse the catalogue (works) or a source (what a site lists). Separate pages, so links decide. */
export function BrowseTabs() {
  return (
    <nav aria-label="Browse" className="mb-4 border-b">
      <ul className="flex gap-1">
        <li>
          <Link to="/browse" activeOptions={{ exact: true, includeSearch: false }} className={link}>
            Catalogue
          </Link>
        </li>
        <li>
          <Link to="/browse/sources" className={link}>
            Sources
          </Link>
        </li>
      </ul>
    </nav>
  );
}
