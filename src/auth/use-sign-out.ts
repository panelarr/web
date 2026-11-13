// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { $api } from "@/api/client";
import { browser, isWebUrl } from "./sso";

/**
 * Signs out, forgets everything cached, and goes to the sign-in page (even if the session was
 * already gone). After single sign-on with provider logout, the server answers where to finish
 * signing out instead: the identity provider, which sends the browser back to the sign-in page.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = $api.useMutation("post", "/auth/logout", {
    onSettled: async (data) => {
      queryClient.clear();
      if (data?.redirect_to && isWebUrl(data.redirect_to)) {
        browser.assign(data.redirect_to);
        return;
      }
      await navigate({ to: "/login", replace: true });
    },
  });
  return { signOut: () => logout.mutate({}), pending: logout.isPending };
}
