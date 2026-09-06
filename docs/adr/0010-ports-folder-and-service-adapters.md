# ADR-0010 — A `ports/` folder per module, one file per role; external-service adapters named `*.<tech>.service.ts`

## Status

**Amended by [ADR-0011](0011-dto-folder-per-module.md)**: `dto.port.ts` is gone
from the roles table below, and `service.port.ts` no longer holds the input
types. Both moved to a `dto/` folder — one transfer model per file, each holding
its type and its mappings — because a transfer model inverts nothing and so was
never a port. The rest of the roles table, and the two implementation families,
stand as written.

Accepted. Supersedes the first bullet of [ADR-0007](0007-one-ports-file.md)'s
Decision ("One `*.ports.ts` per module holds every abstract type it owns") and
narrows its second ("Every port implementation is named
`<module>.<technology>.repository.ts`"). Everything else ADR-0007 decided —
implementations are siblings, the service owns the cache policy, the vocabulary
follows the filename — still stands. Amends
[ADR-0006](0006-module-contracts.md) by restoring an enforced rule it had
recorded as lost.

## Context

Two things had gone wrong with the file roles as ADR-0007 left them.

**1. One `*.ports.ts` per module put unrelated types in one file, and cost an
enforceable rule.** ADR-0007 chose a single ports file on the argument that
"abstract type" is one idea. In practice a module's abstract types are not one
idea: `QuizRepository` is a database dependency the module owns three
implementations of, `QuizDto` is a transfer model the service returns, and
`QuizPublicApi` is a promise to sibling modules that must never change casually.
`quiz.ports.ts` reached 190 lines holding all three, and a reader looking for
the published API had to know it lived at the bottom.

The concrete cost was an enforcement gap that both ADR-0006 and ADR-0007
recorded and neither could close. `modules-are-islands` can only match on file
paths, so with the published API inside `*.ports.ts` the rule could check that a
sibling imported _that file_ but not _which type_ it took from it. Importing
`QuizRepository` across a module border — exactly the coupling the rule exists to
prevent — passed. Both ADRs wrote down the same escape hatch: "if it leaks, split
the public API back into its own file and restore its rule."

**2. `*.repository.ts` had stopped describing what those files do.** When the
generation module added an Anthropic adapter, ADR-0007's rule made it
`generation.anthropic.repository.ts`. But a repository is a collection you put
things into and read them back out of; this file sends an article to a model and
gets a quiz back. Nothing is stored, nothing is retrieved, and there is no
identity to fetch by. The name said "persistence" about a file whose whole job is
a remote call — and the more third-party integrations the app grows (mail,
payments, search), the more files inherit a name that describes none of them.

## Decision

- **Every abstract type a module owns lives under `src/modules/<name>/ports/`,
  one `*.port.ts` file per role.** The roles that exist today:

    | File                                                                    | Holds                                                                             |
    | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
    | `repository.port.ts`                                                    | the persistence port(s)                                                           |
    | `cache.port.ts`                                                         | the cache port                                                                    |
    | `source.port.ts`, `lock.port.ts`, `generator.port.ts`, `tokens.port.ts` | the module's other outbound ports, named for what they invert                     |
    | `dto.port.ts`                                                           | the `<Name>Dto` family the service returns                                        |
    | `service.port.ts`                                                       | the service's input types, its `<Name>Service` interface, and `<Name>ServiceDeps` |

    (ADR-0011 later removed `dto.port.ts` and the input types from this table.)
    | `public-api.port.ts` | `<Name>PublicApi` — the only file another module may import |

    A new outbound dependency is a new file named after the role, not a section
    appended to an existing one.

- **`modules-are-islands` now admits exactly `ports/public-api.port.ts` across a
  module border.** With the published API in a file of its own, "a sibling takes
  the public API and nothing else" is a tool-checked rule again rather than a
  convention. Taking `ArticleRepository` or `QuizDto` across a border fails
  `npm run boundaries`.

- **Port implementations split into two families by the kind of dependency they
  invert.** `<module>.<technology>.repository.ts` adapts something the module
  **stores into and reads back** — Prisma, Redis, the filesystem.
  `<module>.<technology>.service.ts` adapts an **external capability the module
  calls and gets an answer from** — Anthropic today, a mail or payments provider
  next. `generation.anthropic.repository.ts` is now
  `generation.anthropic.service.ts`. Both keep the technology in the middle,
  where the composition root shows it being chosen, and each technology still
  gets its own SDK rule.

- **One dot means the application service, two dots mean an adapter.**
  `<module>.service.ts` is the module's use cases; `<module>.<tech>.service.ts`
  is an outbound adapter. `.dependency-cruiser.cjs` tells them apart with
  `[^/.]+` versus `[^/]+\.[^./]+`: `service-sees-no-infrastructure` matches only
  the one-dot form, so the application service still may not import an SDK,
  while the adapter answers to `anthropic-implementation-stays-below` instead.
  A file that is genuinely a use-case service must never carry a dot in its stem.

- `IMPLEMENTATION_FILES` matches `\.[^./]+\.(repository|service)\.ts$`, so both
  families are bound by `implementations-composed-only-at-the-root` — including
  ones not written yet.

## Consequences

- **The cross-module boundary is fully enforced for the first time.** The rule
  ADR-0006 introduced and ADR-0007 downgraded to a convention is a rule again.
  What remains by hand is keeping entities _out of_ `public-api.port.ts`;
  dependency-cruiser can see the file, not the shape of the types in it.
- **"Where is this declared" costs one more guess than it did.** ADR-0007's
  strongest argument was that one file answers that question. Now a reader picks
  a file by role. The roles are named after what they invert, the folder listing
  is short, and `find all references` still works — but this is a real cost, paid
  for the enforced border above.
- **The filename says which kind of dependency is being inverted.** A reader
  scanning `modules/generation/` sees a Prisma repository, a Redis repository and
  an Anthropic service, and knows which one makes a billable network call
  without opening any of them.
- **`.service.ts` now means two things, distinguished only by a dot.** This is
  the sharpest edge of the decision. A misnamed adapter — `generation.anthropic`
  written without its technology segment — would silently be treated as an
  application service and fail the boundaries build; a misnamed application
  service would silently escape `service-sees-no-infrastructure`. The rules'
  comments say so at the point of definition.
- **Adding a third-party integration is now a shape, not an improvisation.** A
  port file named for the capability, a `<module>.<tech>.service.ts`, its SDK
  rule — the same three steps as the Redis and Prisma trios, ending in a
  differently-suffixed file.

## Alternatives rejected

- **Keep one `*.ports.ts` and split out only `*.contract.ts`.** This is the
  escape hatch ADR-0006 and ADR-0007 both named, and it would have closed the
  enforcement gap on its own. Rejected because it fixes the border and leaves the
  rest of the file — repository, cache, DTOs, service, inputs — in one bag,
  trading a taxonomy of two for a taxonomy of three without making either
  principled.
- **Name the Anthropic adapter `*.gateway.ts` or `*.client.ts`.** Both read well
  in isolation. Rejected because `.service.ts` already exists in the vocabulary
  for "the thing that performs a capability", and a third suffix means a third
  rule family and a third thing to remember. The one-dot/two-dot distinction is
  the price of reusing the word.
- **Leave the Anthropic adapter as `*.repository.ts` and treat "repository" as
  the generic word for "port implementation".** This is what ADR-0007 decided.
  Rejected because it only holds while every port is persistence-shaped, and the
  generation module is the counter-example that arrived.
- **A `ports/index.ts` barrel re-exporting the role files.** Rejected: it would
  restore the single import path and destroy the rule that motivated the split,
  and the repo has no barrel files by convention.
