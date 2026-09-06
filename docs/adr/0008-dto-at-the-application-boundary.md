# ADR-0008 — One DTO per module, at the application boundary

## Status

**Superseded in part by [ADR-0011](0011-dto-folder-per-module.md)**, which moved
the transfer types out of the ports file and put each one in `dto/<model>.dto.ts`
together with its own mappings — including the service input types, whose place
in `service.port.ts` was the reason `ports/dto.port.ts` had to exist at all. The
first two bullets of the Decision below, and the "Put the DTO type in `*.dto.ts`
instead of `*.ports.ts`" alternative it rejected, no longer hold. Everything else
— services return DTOs, routes map both ways, no mapper names a Zod-inferred
type, the DTO file stays plain TypeScript, DTOs carry `Date`s — still stands.

Accepted. Amends the DTO clause of
[ADR-0003](0003-ports-and-domain.md).

## Context

ADR-0003 rejected "a DTO dataclass per boundary per direction" as Python
ceremony, and it was right about the cost. But it left the interface ↔
application boundary held together by structural typing alone, which leaked in
both directions:

- **Routes received entities.** `toTaskResponse(task)` mapped a `Task`, so a
  handler could read any domain field, including ones added later for internal
  rules. What the API exposes was a property of the domain type by default, and
  a decision only at review time.
- **Services received the Zod model.** `service.createTask(request.body)`
  compiled because `CreateTaskBody` happened to be assignable to
  `CreateTaskInput`. The service declared its own input type and then never
  saw it used: change the schema and the service silently accepts the new
  shape, or breaks somewhere far from the edit.
- **The public API was the only thing holding the module border.** ADR-0006
  narrowed what a sibling can call by typing the decoration as `TaskPublicApi`,
  which is enforced — but the service behind it still spoke entities, so
  "entities never cross module borders" held only because the published type
  happened to be written over ids.

All three have the same shape: the module never stated, in one place, what it
accepts and what it publishes. `*.schema.ts` states the _HTTP_ contract, but a
service has two audiences — its routes and its sibling modules — and only one
of them speaks HTTP.

## Decision

- **Each module declares its boundary types in `*.ports.ts`**: the input types
  the use cases accept (`CreateTaskInput`, `ListTasksInput`, `SetAvatarInput`)
  and the `<Name>Dto` they return, alongside the `<Name>Service` interface they
  belong to. ADR-0007's rule stands: every abstract type the module owns lives
  in that one file.
- **`<name>.dto.ts` holds the mappings** and nothing else, in both directions:
  `toXInput()` (wire → service input), `toXDto()` (domain → DTO) and
  `toXResponse()` (DTO → wire), plus the `Page` twins for a paginated list.
- **Services return DTOs.** Every use case ends in `toXDto()`. Entities remain
  the currency _inside_ a use case — entity functions still take and return
  `Task`, and the cache port still stores one — and stop at the service's edge.
- **Routes map both ways and do nothing else.** A handler passes
  `toCreateTaskInput(request.body)`, never `request.body`; where an input comes
  from several parts of the request it is still a mapper's job
  (`toSetAvatarInput(id, body, contentType)`), not an object literal in the
  handler. It returns `toXResponse(dto)`. A bare scalar
  (`service.getTask(request.params.id)`) crosses as itself — there is no model
  to convert.
- **The DTO file is plain TypeScript** — no Zod, no Fastify, no SDK — enforced
  by `dto-stays-pure`. That is what lets a framework-free service import it.
- **No mapper names a Zod-inferred type.** Each declares the wire shape it
  accepts or produces as a plain structural type; the route is where the two
  meet, and the compiler checks the fit there — `toXResponse` against the
  `response` schema, `toXInput` against `request.body`.
- **The DTO carries `Date`s.** Serialization happens at the wire hop only; a
  sibling module consuming a published capability should not have to parse
  dates back out of strings.
- A module with no entity of its own follows the same rule: `modules/onboarding`
  builds `OnboardingResultDto` from two published APIs and its route maps it.

## Why

- The published surface becomes an explicit, greppable decision per module.
  Adding a column to the Prisma model and the entity changes nothing for
  clients until someone edits the DTO — which is the moment to think about it.
- The input mapper turns an accident into a check. `CreateTaskInput` already
  existed before this ADR; nothing referenced it at the boundary, so it
  documented an intention the compiler never tested. Now a schema change that
  drifts from the service's input fails at the route, next to both.
- "Entities never cross module borders" stops depending on how `*PublicApi` was
  written: the service's return type is already a DTO, so a published API can
  only ever be satisfied by DTO fields.
- The hops sit side by side, so `wire → input → domain → DTO → wire` is
  readable in one file per module instead of being split across the schema.
- The cost is one near-identity mapping per direction per module today. That is
  the trade the template already made for `CreateTaskBody` vs `CreateTaskInput`:
  the copying is cheap, and it is the seam that makes divergence a one-file
  change instead of a refactor.

## Alternatives considered

- **Keep entities as the service's output, and `request.body` as its input**
  (ADR-0003 as written). Cheapest, but it is the state described in the
  Context: no single place says what enters or leaves the module.
- **A DTO type per layer and per direction** (request DTO, service DTO,
  response DTO). Still rejected — and this ADR does not add one. The service's
  input types are the ones it already declared; what changed is that the route
  must now convert into them instead of relying on structural assignability.
  The one new type is `ListTasksInput`, split from the repository's
  `TaskListQuery` so that a service input is never a storage type.
- **Put the DTO type in `*.dto.ts` instead of `*.ports.ts`.** Rejected to keep
  ADR-0007 intact: one file per module holds every abstract type, and these are
  types. `*.dto.ts` earns its place as behaviour — the mappings — not as a
  second type file.
- **Make the DTO JSON-safe** (dates already ISO strings) so routes need no
  response mapper. Rejected: it pushes a serialization concern into the
  application layer and taxes every sibling module.
- **Keep `toXResponse` in `*.schema.ts`**, typed with `z.infer`. Workable, and
  it would let the mapper name its return type — but it separates the hops and
  leaves the schema file doing two jobs. The route already gives the type
  check, so co-locating the mappings won.

## Consequences

- Adding a field to the API is three deliberate edits: entity, DTO, schema. A
  field that is not mapped cannot be exposed, or accepted, by accident.
- `TaskDto` and `Task` are structurally identical today, so TypeScript will not
  stop code from passing one where the other is expected — the unit tests do
  exactly that when seeding the cache. Nominal branding would fix it and is not
  worth the ceremony; the boundary that matters is the declared type.
- Unit tests assert on DTOs and call services with input objects directly.
  Because a DTO carries `Date` values, existing assertions read the same as
  before.
- Every paginated use case needs the page mappers too — `toXPageDto` in the
  service, `toXPageResponse` in the route.
- A new module means one more small file. `modules/task` is the reference.
