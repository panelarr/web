// SPDX-License-Identifier: GPL-3.0-or-later

// Invite links carry the token in the URL fragment (`…/invite#token=…`): browsers never send
// the fragment to the server, so the token stays out of server and proxy logs.

export function inviteLink(token: string, base: string = document.baseURI): string {
  return new URL(`invite#token=${encodeURIComponent(token)}`, base).href;
}

export function tokenFromHash(hash: string): string | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token");
  return token ? token : undefined;
}
