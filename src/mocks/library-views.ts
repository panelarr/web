// SPDX-License-Identifier: GPL-3.0-or-later

// Saved library views, as the server keeps them: per user, in an order, exactly one default
// once there are any, names unique ignoring case, at most 50, definitions checked strictly.
import { HttpResponse } from "msw";
import type { components } from "@/api/schema.gen";
import { commit, db, type MockDb, type MockLibraryView, newId } from "./db";
import { emit } from "./events";
import { type MockOperation, op, problem } from "./op";

type S = components["schemas"];

const MAX_VIEWS = 50;
const MAX_NAME = 60;
const now = () => new Date().toISOString();

function invalid(field: string, message: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "Invalid request",
      status: 400,
      code: "invalid_request",
      detail: `${field}: ${message}`,
      errors: [{ field, message }],
    },
    { status: 400, headers: { "Content-Type": "application/problem+json" } },
  );
}

const FILTER_KEYS = ["unread", "started", "downloaded", "bookmarked", "new"];
const SORTS = ["title", "added", "read", "latest", "updated", "unread", "total"];
const LAYOUTS = ["compact", "comfortable", "list"];
const RATINGS = ["safe", "suggestive", "erotic", "pornographic", "unknown"];

/** What's wrong with a definition, as the server says it; undefined when it's fine. */
export function definitionProblem(raw: unknown): [string, string] | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return ["definition", "required"];
  const d = raw as Record<string, unknown>;
  const allowed = [
    "filters",
    "types",
    "statuses",
    "content_ratings",
    "updated_within_days",
    "sort",
    "reverse",
    "display",
  ];
  const unknownKey = Object.keys(d).find((k) => !allowed.includes(k));
  if (unknownKey) return ["definition", `unknown field "${unknownKey}"`];
  if (d.filters !== undefined) {
    const filters = d.filters as Record<string, unknown>;
    for (const [key, value] of Object.entries(filters)) {
      if (!FILTER_KEYS.includes(key)) return ["definition.filters", `unknown field "${key}"`];
      if (value !== "include" && value !== "exclude")
        return [`definition.filters.${key}`, "must be include or exclude"];
    }
  }
  for (const field of ["types", "statuses"]) {
    const values = d[field];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.length > 20) return [`definition.${field}`, "at most 20 values"];
    if (values.some((v) => typeof v !== "string" || v.length < 1 || v.length > 40)) {
      return [`definition.${field}`, "each value must be 1 to 40 characters"];
    }
  }
  const ratings = d.content_ratings;
  if (ratings !== undefined) {
    if (!Array.isArray(ratings) || ratings.length > RATINGS.length) {
      return ["definition.content_ratings", `at most ${RATINGS.length} values`];
    }
    if (ratings.some((v) => !RATINGS.includes(v))) {
      return ["definition.content_ratings", `each value must be one of ${RATINGS.join(", ")}`];
    }
    if (new Set(ratings).size !== ratings.length) return ["definition.content_ratings", "values must be unique"];
  }
  const days = d.updated_within_days;
  if (days !== undefined && (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365)) {
    return ["definition.updated_within_days", "must be 1 to 365"];
  }
  if (d.sort !== undefined && !SORTS.includes(d.sort as string)) return ["definition.sort", "unknown sort"];
  if (d.display !== undefined) {
    const display = d.display as Record<string, unknown>;
    const keys = ["layout", "unread_badges", "download_badges", "continue_button"];
    const bad = Object.keys(display).find((k) => !keys.includes(k));
    if (bad) return ["definition.display", `unknown field "${bad}"`];
    if (display.layout !== undefined && !LAYOUTS.includes(display.layout as string)) {
      return ["definition.display.layout", "unknown layout"];
    }
  }
  return undefined;
}

/** A user's views in their order (sessions saved before views existed have none). */
export function viewsOf(d: MockDb, userId: string): MockLibraryView[] {
  d.libraryViews ??= [];
  return d.libraryViews.filter((v) => v.user_id === userId).sort((a, b) => a.position - b.position);
}

const visible = ({ user_id: _, ...view }: MockLibraryView): S["LibraryView"] => view;

function renumber(views: MockLibraryView[]) {
  views.forEach((v, position) => {
    v.position = position;
  });
}

function nameProblem(raw: unknown): [string, string] | string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME) return ["name", `must be 1 to ${MAX_NAME} characters`];
  return name;
}

const taken = (views: MockLibraryView[], name: string, except?: string) =>
  views.some((v) => v.id !== except && v.name.toLowerCase() === name.toLowerCase());

const nameTaken = () => problem(409, "name_taken", "Conflict", "you have a view with this name");
const notFound = () => problem(404, "not_found", "Not found", "no such view");

/** Tells the user's devices (the mock has only the one browser). */
function changed(viewId?: string) {
  emit("library_views.changed", viewId ? { view_id: viewId } : {});
  commit();
}

export function libraryViewOperations(requireUser: () => S["User"] | Response): MockOperation[] {
  return [
    op("get", "/me/library-views", () => {
      const user = requireUser();
      if (user instanceof Response) return user;
      return HttpResponse.json<S["LibraryViewList"]>({ views: viewsOf(db(), user.id).map(visible) });
    }),

    op("post", "/me/library-views", async ({ request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const body = (await request.json()) as Partial<S["CreateLibraryViewRequest"]>;
      const name = nameProblem(body.name);
      if (typeof name !== "string") return invalid(...name);
      const bad = definitionProblem(body.definition);
      if (bad) return invalid(...bad);
      const d = db();
      const mine = viewsOf(d, user.id);
      if (mine.length >= MAX_VIEWS) return problem(409, "view_limit", "Conflict", `at most ${MAX_VIEWS} views`);
      if (taken(mine, name)) return nameTaken();
      const isDefault = body.default === true || mine.length === 0;
      if (isDefault) for (const v of mine) v.default = false;
      const view: MockLibraryView = {
        user_id: user.id,
        id: newId(),
        name,
        position: mine.length,
        default: isDefault,
        definition: body.definition as S["LibraryViewDefinition"],
        created_at: now(),
        updated_at: now(),
      };
      d.libraryViews.push(view);
      changed(view.id);
      return HttpResponse.json<S["LibraryView"]>(visible(view), { status: 201 });
    }),

    op("put", "/me/library-views/order", async ({ request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const { ids } = (await request.json()) as S["OrderLibraryViewsRequest"];
      const mine = viewsOf(db(), user.id);
      const ok =
        ids.length === mine.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => mine.some((v) => v.id === id));
      if (!ok) return problem(409, "order_mismatch", "Conflict", "list each of your views exactly once");
      for (const view of mine) view.position = ids.indexOf(view.id);
      changed();
      return HttpResponse.json<S["LibraryViewList"]>({ views: viewsOf(db(), user.id).map(visible) });
    }),

    op("get", "/me/library-views/{id}", ({ params }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const view = viewsOf(db(), user.id).find((v) => v.id === params.id);
      return view ? HttpResponse.json<S["LibraryView"]>(visible(view)) : notFound();
    }),

    op("patch", "/me/library-views/{id}", async ({ params, request }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const body = (await request.json()) as S["UpdateLibraryViewRequest"];
      let name: string | undefined;
      if (body.name !== undefined) {
        const checked = nameProblem(body.name);
        if (typeof checked !== "string") return invalid(...checked);
        name = checked;
      }
      if (body.definition !== undefined) {
        const bad = definitionProblem(body.definition);
        if (bad) return invalid(...bad);
      }
      const mine = viewsOf(db(), user.id);
      const view = mine.find((v) => v.id === params.id);
      if (!view) return notFound();
      if (body.default === false && view.default) {
        return problem(
          409,
          "default_required",
          "Conflict",
          "one view must be the default: make another view the default instead",
        );
      }
      if (name !== undefined && taken(mine, name, view.id)) return nameTaken();
      if (name !== undefined) view.name = name;
      if (body.definition !== undefined) view.definition = body.definition;
      if (body.default === true) for (const v of mine) v.default = v.id === view.id;
      view.updated_at = now();
      changed(view.id);
      return HttpResponse.json<S["LibraryView"]>(visible(view));
    }),

    op("delete", "/me/library-views/{id}", ({ params }) => {
      const user = requireUser();
      if (user instanceof Response) return user;
      const d = db();
      const mine = viewsOf(d, user.id);
      const view = mine.find((v) => v.id === params.id);
      if (!view) return notFound();
      if (mine.length <= 1) return problem(409, "last_view", "Conflict", "your only view can't be deleted");
      d.libraryViews = d.libraryViews.filter((v) => v !== view);
      const rest = mine.filter((v) => v !== view);
      renumber(rest);
      if (view.default && rest[0]) rest[0].default = true;
      changed(view.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
