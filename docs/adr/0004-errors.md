# ADR-0004 — Domain errors without status codes; no message catalog; no envelope

## Status

Accepted.

## Context

The previous template created errors with `@fastify/error`, embedding the HTTP
status at the throw site (`new NotFoundError(...)` was born a 404), sourced
every client-facing string from one global `RESPONSE_MESSAGES` object, and
wrapped every success response in a `{ message, data }` envelope whose
human-readable sentence was assembled inside the _service_.

Three separate couplings hid in that design: business code knew transport
codes; every module wrote to one global catalog file; and services produced
presentation copy.

## Decision

1. **Errors carry a semantic `code`, not a status.** `AppError` subclasses
   (`NotFoundError`, `ConflictError`, `UnprocessableError`, ...) live in
   `lib/errors.ts`; modules define named errors with their message baked in
   (`TaskArchivedError`). The `code → HTTP status` table exists once, in the
   error-handler plugin. A future GraphQL/queue/CLI driver maps the same codes
   differently without touching a single service.
2. **Messages live with the error that owns them.** A global catalog is a
   merge-conflict hub with no consumer; locality wins. If real i18n arrives,
   map `code` (+ error name) to translations at the edge — the design already
   supports it.
3. **No success envelope, no success sentences.** Endpoints return the
   resource (or page) itself; "Task created successfully." strings are UI
   copy and do not belong in an API's business layer. The uniform error body
   `{ "message": "..." }` is the only envelope, produced only by the
   error-handler.

## Consequences

- Handlers contain no try/catch: they let domain errors fly and the plugin
  translates. Route schemas document the error statuses per endpoint.
- Fastify- and plugin-originated errors (validation 400, rate-limit 429) are
  normalized into the same `{ message }` body by the same handler, so clients
  see one error shape everywhere.
- Unknown errors are logged in full and answered with a bare 500 — never a
  stack, never an internal message.
- If a client contract requires a success envelope, it is a _routes-layer_
  decision (wrap in `toXResponse`/the route), invisible to services — the
  rule that matters survives any envelope shape.
