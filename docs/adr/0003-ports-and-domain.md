# ADR-0003 — Real repository ports; domain as types + pure functions

## Status

Accepted, amended by [ADR-0008](0008-dto-at-the-application-boundary.md): the
last Decision bullet below rejected a DTO between service and routes. That half
is superseded — a service now returns a `<Name>Dto` and the entity stops at its
edge. The rest of the bullet stands: `toTask` still maps the row inside the
Prisma repository, and requests still arrive as the service's own input type.

Accepted, amended by [ADR-0007](0007-one-ports-file.md): every abstract type a
module owns now lives in one `*.ports.ts`, and implementations are named
`<module>.<technology>.repository.ts`. What a port _is_ is unchanged — read
"adapter" below as "port implementation", and `task.repository.ts` as the ports
section of `task.ports.ts`. The four methods named in the Decision are still
exactly `TaskRepository`.

## Context

Two extremes were on the table.

The previous Node template's "repository" re-exported the entire Prisma
delegate (`create/findMany/update/...` with full Prisma argument types), so
services composed queries (`select`, `where`) themselves. The layer existed in
name only: Prisma's API surface _was_ the application's data-access API, the
`NotFoundError` with a client-facing message was thrown from inside the data
layer, and swapping the ORM — or even unit-testing a service — meant
reimplementing Prisma's type surface.

The Python reference template sits at the other end: abstract port classes,
domain entities as classes with methods, DTO dataclasses per boundary, and
mapper modules for each conversion — idiomatic in Python, ceremony-heavy in
TypeScript, where structural typing does most of that work for free.

## Decision

- **The port is a narrow, hand-written interface in domain vocabulary**
  (`create(NewTask)`, `findById(id)`, `save(task)`, `list(query)` — four
  methods, not thirty). It exposes _what the use cases need_, not what the
  ORM offers.
- **The adapter owns everything Prisma**: query construction, `select`s,
  cursor mechanics, error translation (P2025 → `TaskNotFoundError`), and the
  row → domain mapping (`toTask`).
- **The domain is plain types + pure transition functions**
  (`draftTask`, `completeTask`, `archiveTask`) rather than entity classes.
  Rules that depend on state or time live here; structural validation lives in
  the request schema.
- **Conversions exist only where representations differ**: `toTask` (row →
  domain) and `toTaskResponse` (domain → wire). No DTO layer between service
  and routes — the service's declared input/output types are that boundary,
  and TypeScript checks it structurally.

## Why

- A narrow port is the difference between "repository pattern" and "renamed
  ORM client". It makes the in-memory test implementation ~40 lines, keeps
  services testable without a database, and turns an ORM major-version
  migration into an adapter-file concern (this template's Prisma 6 → 7 delta
  proves the point: the client API changed, the port did not).
- Pure transition functions give the same invariant-protection as entity
  classes with less machinery, and they are trivially testable
  (`completeTask(task)` in, new state or named error out).
- Skipping the mandatory-DTO ceremony is an honest TypeScript translation of
  the Python rule's _intent_: the boundaries exist as types; the copying
  exists only where shapes actually diverge.

## Consequences

- Every new query need is a deliberate port extension, not a free call into
  the ORM — slightly more friction, exactly where design attention belongs.
  Prisma's full power remains available _inside_ the adapter.
- The port's semantics (ordering, cursor behavior) are a contract two
  implementations share; the adapter integration tests are that contract's
  tests. Keep the in-memory implementation faithful when the contract grows.
- `findUniqueOrFail`-style helpers are gone on purpose: existence policy
  ("is missing a 404 or a domain event?") is the service's decision, so the
  port returns `null` and the service throws the named error.
