# ADR-0002 — Fastify-native composition instead of a DI container

## Status

Accepted.

## Context

The previous template wired everything through Awilix in CLASSIC mode:
factories registered under string names, injected by **parameter-name
matching**, loaded by filesystem glob (`loadModules`), typed by a
hand-maintained `Cradle` type, with a scaffolding generator required because
hand-written files "silently skip the wiring" (its own rulebook said so).

Dependency _injection_ — passing collaborators in as parameters — is
essential and this template uses it everywhere. The question is only whether a
_container_ should do the passing.

## Decision

No container. Three mechanisms replace it, all native:

1. **App-level infrastructure** (config, PrismaClient) is provided by plugins
   that `decorate` the Fastify instance, typed once in
   `src/types/fastify.d.ts`. This _is_ Fastify's sanctioned DI mechanism.
2. **Module wiring** is explicit code in the module's `index.ts`: build each
   port implementation (`createPrismaTaskRepository(fastify.prisma)`,
   `createRedisTaskCache(fastify.redis, ...)`), pass them to
   `createTaskService({ repository, cache, clock })`, hand the service to
   `taskRoutes(service)`. Under ten lines of ordinary function calls.
3. **App wiring** is explicit registration order in `src/app.ts`.

## Why the container lost

- **The compiler replaces the registry.** With explicit calls, a missing or
  mistyped dependency is a _compile error_ at the call site. With Awilix it is
  a runtime resolution error — and the `Cradle` type asserting that
  `"taskService"` maps to `TaskService` is a hand-written claim nothing
  verifies (`asFunction` erases it to `any` at registration).
- **Parameter names stop being refactorable.** CLASSIC mode makes renaming a
  parameter a behavioral change. "Rename symbol" in the IDE becomes unsafe in
  exactly the files where it should be routine.
- **The generator requirement disappears.** The old Rule 0 ("never create
  modules by hand") existed because manual wiring across four files was too
  error-prone to trust. When wiring is a handful of explicit lines, hand-writing a
  module is safe, and scaffolding becomes a convenience rather than a safety
  device.
- **Navigation works again.** "Find all references" on `createTaskService`
  shows the composition root. A container resolves names reflectively at
  runtime, invisible to tooling.
- **Less machinery to boot.** No filesystem glob scanning at startup, no
  RESOLVER symbols, no duplicate registry beside Fastify's decorations (the
  old template registered `log`, `prisma`, `config` in _both_ systems).
- **It matches the ecosystem's direction.** The Fastify core team's official
  demo wires repositories and services as plugins + decorators; Matteo
  Collina's "modular monolith" guidance is plugins over containers.

## The trade-offs accepted

- **Wiring is written by hand.** For a deep graph (dozens of services) a
  container amortizes; at 2–5 collaborators per module, explicitness is
  cheaper than the indirection. If a module's `index.ts` ever exceeds ~20
  lines of wiring, extract factory helpers — not a container.
- **Per-request scoping** (a per-request child container) has no direct
  equivalent; Fastify's request decorators and hooks cover the same needs.
- **Test substitution** happens by constructing services directly with fakes
  (unit lane) or by building the app against a test database (integration
  lane) — not by overriding registrations. This is deliberate: it keeps tests
  running the production composition.

## Consequences

Handlers moved inline into `*.routes.ts` (the old separate handler file +
handler type existed mostly to be a container entry). Cross-module
capabilities are decorations (see recipes). If the team later insists on a
container, the layering in this template survives intact — the container
would only replace the two composition roots.
