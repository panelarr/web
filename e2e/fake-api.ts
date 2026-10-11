// SPDX-License-Identifier: GPL-3.0-or-later

import type { Page } from "@playwright/test";
import { apiKey, health, me, metaConnection, session, setupStatus, systemInfo } from "../src/mocks/data";

/**
 * Answers the API at the network level, for the production build (which has no mock server):
 * a signed-in admin on a finished install.
 */
export async function fakeApi(page: Page): Promise<void> {
  const answers: Record<string, unknown> = {
    "GET /system/info": systemInfo,
    "GET /system/health": health,
    "GET /setup": setupStatus,
    "GET /me": me,
    "GET /me/sessions": { sessions: [session] },
    "GET /me/api-keys": { api_keys: [apiKey] },
    "GET /system/meta": metaConnection,
    "PATCH /me": me,
  };
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/events") return route.fulfill({ status: 204 });
    const body = answers[`${request.method()} ${path}`];
    if (body === undefined) {
      return route.fulfill({
        status: 404,
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "about:blank", title: "Not found", status: 404, code: "not_found" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}
