// SPDX-License-Identifier: GPL-3.0-or-later

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { $api } from "@/api/client";

/** Signs out, forgets everything cached, and goes to the sign-in page (even if the session was already gone). */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = $api.useMutation("post", "/auth/logout", {
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: "/login", replace: true });
    },
  });
  return { signOut: () => logout.mutate({}), pending: logout.isPending };
}
