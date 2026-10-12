// SPDX-License-Identifier: GPL-3.0-or-later

import { LinkTabs } from "@/components/scroll-strip";

/** Browse the catalogue (works) or a source (what a site lists). Separate pages, so links decide. */
export function BrowseTabs() {
  return (
    <LinkTabs
      label="Browse"
      className="mb-4"
      tabs={[
        {
          key: "catalogue",
          label: "Catalogue",
          link: { to: "/browse", activeOptions: { exact: true, includeSearch: false } },
        },
        { key: "sources", label: "Sources", link: { to: "/browse/sources" } },
      ]}
    />
  );
}
