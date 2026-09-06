# ADR-0007 — One `*.ports.ts` per module; implementations named by technology; no cache decorator

## Status

**Superseded in part by [ADR-0010](0010-ports-folder-and-service-adapters.md)**,
which moved every abstract type into a `ports/` folder — one `*.port.ts` per
role — and split port implementations into `*.<tech>.repository.ts` (stores) and
`*.<tech>.service.ts` (external capabilities). The first bullet of the Decision
below no longer holds and the second holds only for persistence-shaped ports;
the rest — implementations are siblings, the service owns the cache policy, the
vocabulary follows the filename — still stands. The Consequence this ADR recorded
as a loss ("the cross-module boundary loses one enforced rule") was what ADR-0010
was written to recover.

Accepted. Amends [ADR-0001](0001-vertical-modules.md) (file-role names),
[ADR-0003](0003-ports-and-domain.md) (where port types live) and
[ADR-0006](0006-module-contracts.md) (which gave the published contract its own
file). Supersedes the `*.repository.ts`, `*.contract.ts`,
`*.repository.cached.ts`, `*.repository.prisma.ts`, `*.cache.redis.ts` and
`*.storage.s3.ts` naming.

## Context

The module had grown four kinds of type file — `*.repository.ts` (a port),
`*.ports.ts` (other ports), `*.contract.ts` (the published API) and the service
interface declared inline in `*.service.ts` — plus three naming shapes for the
files that implement them (`*.repository.prisma.ts`, `*.cache.redis.ts`,
`*.storage.s3.ts`) and a fourth kind, `*.repository.cached.ts`, that implemented
a port by wrapping another implementation of the same port.

Two objections drove this change, both about where a reader has to look:

1. **"Abstract type" is one idea, so it should be one file.** Splitting the
   module's interfaces across four files by _what kind_ of dependency they
   invert asks a reader to know the taxonomy before they can find a type.
2. **A repository that wraps a repository hides the policy.** The read-through
   decorator meant the cache existed nowhere the use cases could see it. Whether
   `completeTask` may act on a cached snapshot is a rule about that use case,
   and it was being decided in a file the use case never mentions.

## Decision

- **One `*.ports.ts` per module holds every abstract type it owns**, in a fixed
  order: outbound ports, the `<Name>Service` interface, then `<Name>PublicApi`
  — the type sibling modules may use — last. Nothing else in the module
  declares an interface. The order is the only marker: module folders carry no
  comments, so `<Name>PublicApi` is identified by its name and its position at
  the foot of the file.
- **Every port implementation is named `<module>.<technology>.repository.ts`**:
  `task.prisma.repository.ts`, `task.cache.repository.ts`,
  `user.s3.repository.ts`. One role suffix for the family, technology in the
  middle where the composition root shows it being chosen.
- **Implementations are siblings and never import each other.** There is no
  `*.repository.cached.ts`; the cache implementation talks to Redis and nothing
  else. `implementations-composed-only-at-the-root` enforces this — composing
  two implementations is what `index.ts` is for.
- **The service holds both ports and owns the cache policy.** A query
  (`getTask`) reads the cache and falls back to the repository; a command
  (`completeTask`) reads the repository directly and invalidates after the save.
  The `loadForUpdate` port method that existed only to keep the decorator honest
  is gone — the service distinguishes the two reads by which port it calls.
- **The vocabulary follows the filename.** Renaming a role renames its port
  type, its factory and the dependency key the service receives it under — not
  just the file. `user.s3.repository.ts` exports `createS3AvatarRepository`
  returning `AvatarRepository` into a dep called `avatars`; the test helper is
  `in-memory-avatar-repository.ts`. A file renamed without its vocabulary is a
  half-done rename, and this is the part no tool checks.
- `modules-are-islands` now admits `*.ports.ts` across a module border.

## Consequences

- **One file answers "where is this declared".** A module's types are all in
  `*.ports.ts`; everything else in the folder is behavior.
- **The caching policy is readable in the use case that owns it**, and tested
  with the use cases (`test/unit/task.service.test.ts`) rather than in a
  decorator test of its own. Turning caching off means passing a different
  `TaskCache` implementation, not deleting a wrapper.
- **A use case can now get caching wrong.** The decorator made a stale
  command-read structurally impossible; a service can call `cache.read` in a
  command by accident. This is the real cost of the change, and it is paid down
  with tests, not types: the "commands read the source of truth" block in
  `test/unit/task.service.test.ts` fails if anyone does.
- **The cross-module boundary loses one enforced rule.** With the published API
  inside `*.ports.ts`, dependency-cruiser can still check that only that file
  crosses a border, but not which type a sibling takes from it — nor that the
  published section stays free of entities (`contract-is-types-only` is gone).
  Both are now conventions. If either leaks, split the public API back into
  `*.contract.ts` and restore its rule.
- **New technologies are covered by default.** `IMPLEMENTATION_FILES` matches
  the whole `<module>.<tech>.repository.ts` family, so a new implementation is
  bound by the composition-root rule the day it is added; only its SDK rule has
  to be written by hand.

## Alternatives rejected

- **Keep the decorator, move only the naming.** Would have answered the naming
  objection and left the policy invisible, which was the substantive one.
- **Keep `loadForUpdate` on the port.** Without a decorator, nothing reads it
  differently from `findById`; the distinction now lives in which dependency the
  use case calls, where a reader can see it.
- **Split the service interface out again into `*.service.types.ts`.** A fifth
  file to avoid one section header.
