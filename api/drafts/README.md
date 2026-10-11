# Draft API additions

The web app is built against the server's published spec (`../openapi.yaml`, copied from
the server's `main` by `make spec-sync`). When the app needs an endpoint the server hasn't
specified yet, its shape is drafted here first, in the server's style (problem details,
cursor pages, `x-panelarr-access`), and proposed to the server. **The server owns the
final shape.**

- One YAML file per area (`works.yaml`, `reader.yaml`, …), each a partial OpenAPI document
  with `paths` and `components`.
- `make gen` merges them into the generated types and marks every draft operation with
  `x-panelarr-draft: true`. `src/api/drafts.gen.ts` lists them, and the mock server
  answers them in `make run` (see `docs/api.md`).
- When the server's spec gains a path or schema that a draft also defines, `make gen`
  fails: delete it here, then fix whatever drifted.
