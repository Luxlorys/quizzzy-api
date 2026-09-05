# ADR-0001 — Vertical feature modules, layered inside

## Status

Accepted.

## Context

Clean Architecture is usually presented as horizontal top-level layers
(`domain/`, `ports/`, `use_cases/`, `adapters/`, `drivers/`), one tree per
layer, features spread across all of them. That is how the Python reference
template is organized. Node.js community guidance (the Node Best Practices
"structure by components" rule, Fastify's encapsulation model) pushes the
other way: group by feature, not by technical role.

## Decision

One folder per feature under `src/modules/`, with the clean-architecture
layers **inside** the module as file-role conventions (`*.entity.ts`,
`*.ports.ts`, `*.service.ts`, `*.prisma.repository.ts`, `*.routes.ts` — see
[ADR-0007](0007-one-ports-file.md) for the current names).
The dependency rule between the roles is identical to the horizontal version
and enforced by dependency-cruiser; only the folder geometry differs.

## Why not horizontal layers

- **Change locality.** A typical feature change touches every layer of one
  feature. Vertical: one folder. Horizontal: five trees, and the reviewer
  reconstructs the slice mentally.
- **Deletability.** Removing a feature is `rm -rf modules/task` plus one line
  in `app.ts`. Horizontal layouts leave orphans.
- **Scaling by team.** Two developers on two features touch disjoint folders.
- **Fastify fit.** A module is exactly a Fastify plugin; encapsulation gives
  each module its own scope for hooks and decorations for free.

## What survives from the horizontal version

Everything that matters: the dependency rule, the port/adapter split, the
framework-free core. A module is a hexagon; the app is a fleet of hexagons.

## Consequences

- File-role naming is load-bearing (rules match `*.service.ts` etc.); a
  mis-named file silently escapes its layer's restrictions — mitigated by
  review and by the small closed set of role suffixes.
- Truly shared domain concepts (money, ids) must live in `lib/` — watch that
  `lib/` stays small and framework-free; the boundary rules keep it honest.
