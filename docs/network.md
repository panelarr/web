# Network: proxies, solvers and profiles

Panelarr holds the network services its plugins may use, so they're set up once instead of
in every plugin's own admin. They're options: nothing uses one until an admin chooses it.

## The pieces

- **Proxies**: HTTP, HTTPS or SOCKS5, for example a VPN container. A password is never sent
  back to the browser; left empty in a form, the stored one stays.
- **Solvers**: services that get past browser challenges (FlareSolverr-compatible).
- **Profiles**: a proxy and a solver together with speed limits, how many requests at once, the
  browser to look like, DNS over HTTPS, extra headers, a shared cookie jar and timeouts. Anything
  left empty is the plugin's own setting. Saving a profile replaces all of its settings.

Each piece is **shared** (made on Admin → Network, offered everywhere) or **custom** (made for
one plugin, extension, source or metadata provider, and offered only there). A plugin's own
proxies and solvers serve its profiles, its extensions' and its sources'; a provider's serve
that provider. The server enforces this; the app only offers what fits.

## Where a profile is chosen

At each level the choice is one of: inherit, the plugin's own settings (to opt out where a
broader profile is chosen), a shared profile, or one of that target's custom profiles, made
right there. The most specific choice wins:

- sources: the source, then its extension, then its plugin, then the profile for everything;
- metadata providers: the provider, then the metadata service, then the profile for everything.

| Where | Page |
|---|---|
| everything | Admin → Network → Profiles |
| a plugin, its extensions, its sources | the plugin's page → Network |
| an extension | the plugin's page → Extensions → its details |
| a source | Admin → Sources → its "Settings and network" |
| the metadata service and each provider | Admin → System |

The pickers show what's in effect and where it comes from, and whether the plugin has it yet:
*on its way* (changes arrive within seconds), *in use*, or *not applied* (with the reason; the
server tries again). A plugin that doesn't take profiles, or can't use a solver, says so. A
source's own view also shows what its plugin says it actually uses.

The browser never talks to a plugin or the metadata service: everything goes through the server.
