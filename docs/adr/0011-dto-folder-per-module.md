# ADR-0011 — A `dto/` folder per module: one transfer model per file, type and mappings together

## Status

Accepted. Supersedes the "each module declares its boundary types in
`*.ports.ts`" bullet of [ADR-0008](0008-dto-at-the-application-boundary.md) —
as carried forward by [ADR-0010](0010-ports-folder-and-service-adapters.md) into
`ports/dto.port.ts` and the input types in `ports/service.port.ts` — and
replaces the single `<module>.dto.ts` mapping file. Everything else ADR-0008
decided — services return DTOs, routes map both ways, the DTO file stays plain
TypeScript, DTOs carry `Date`s — still stands.

## Context

ADR-0008 put the transfer types in the ports file and the mappings in
`<module>.dto.ts`, on the reasoning that ports hold types and `*.dto.ts` earns
its place as behaviour. ADR-0010 kept that split when it broke the ports file
apart, producing `ports/dto.port.ts`.

Three things were wrong with the result.

**1. `dto.port.ts` is not a port.** Every other file under `ports/` inverts an
outbound dependency the module owns several implementations of, or publishes a
capability. `dto.port.ts` does neither: it holds the transfer models the service
returns, has exactly one implementation — the mapper next door — and inverts
nothing. It sat in `ports/` because ADR-0007 had ruled that every type the module
owns lives in one place, and ADR-0010 inherited the rule without re-testing it
against the taxonomy it had just introduced. The folder's own guarantee —
"a file under `ports/` names something the module needs from outside" — was
false for one of its six files.

**2. The type was never next to the mapping that produces it.** Adding a field
to `QuizDto` meant editing `ports/dto.port.ts`, then `quiz.dto.ts` for
`toQuizDto`, then `quiz.dto.ts` again for `toQuizResponse` — three edits in two
files for one decision. In a language with classes a DTO carries its own `to`
and `from`; the TypeScript equivalent of that object is the module scope, and
splitting the type away from its mappings gave up the only cohesion the pattern
has.

**3. One mapping file per module does not scale.** `quiz.dto.ts` reached 285
lines holding four unrelated transfer models — the quiz, the library list item,
the attempt and the graded result — plus the input mappers for all of them. It
was the third-largest file in the module and had no internal boundary a reader
could use.

The reason the types could not simply move into `<module>.dto.ts` is a cycle:
`service.port.ts` names the DTOs (they are the service's return types) and
`<module>.dto.ts` named the inputs (they are what its input mappers produce), so
merging the two type groups into the mapping file makes `service.port.ts →
quiz.dto.ts → service.port.ts`, which fails `no-circular` and `port-is-types-only`.
`dto.port.ts` existed to break that cycle. That is a reason for a file to exist,
but not a reason anyone can read off the folder.

## Decision

- **Every transfer model gets its own file under `src/modules/<name>/dto/`,
  holding the type and all its mappings**: `dto/quiz.dto.ts`,
  `dto/quiz-list-item.dto.ts`, `dto/attempt.dto.ts`,
  `dto/attempt-result.dto.ts`. A file is named after the model, not the module —
  the module is already in the path, the same way `ports/repository.port.ts` is.

- **A DTO file owns both directions of its model**: the `<Name>Dto` type, the
  input type the use case accepts, `toXInput` (wire → input), `toXDto`
  (domain → DTO) and `toXResponse` (DTO → wire). Helpers used by one model only
  (`toAnswerDto`, `toQuestionDto`, `attemptFieldsOf`) stay unexported in the file
  that needs them, which is what the single mapping file could not offer.

- **The service's input types move out of `service.port.ts` with their DTOs.**
  This is what dissolves the cycle rather than working around it:
  `dto/*.dto.ts` imports the entity and nothing else in the module, and
  `service.port.ts` imports the DTO files. `ports/dto.port.ts` is deleted, and
  `service.port.ts` is left holding exactly the `<Name>Service` interface and
  its `Deps` — a signature written in a vocabulary declared elsewhere, which is
  what an interface should be.

- **The layer order inside a module gains a rung**, and `dto/` sits below
  `ports/`, not inside it:

    ```
    entity/errors  →  dto/  →  ports/  →  service  →  routes/schema
    ```

- **`DTO_ALLOWED` no longer admits `ports/`.** A DTO file may import the domain,
  its sibling DTO files and pure lib. The old rule allowed `ports/` because the
  mapper needed the input types from `service.port.ts`; with those types moved,
  the dependency runs one way only and the tool enforces it.

- **`PORT_ALLOWED` gains `dto/*.dto.ts`**, which is how `service.port.ts` and
  `public-api.port.ts` name what the service takes and returns.

- **`IMPLEMENTATION_ALLOWED` is unchanged, and deliberately excludes `dto/`.**
  An adapter speaks entities, because that is the vocabulary its port is written
  in; a repository that returned a DTO would be answering a question the service
  did not ask. The route ↔ service hop is the one that needs a transfer model —
  the service ↔ repository hop does not, and now cannot.

- `modules-are-islands` needs no change: `dto/` is inside the module, so a
  transfer model still cannot cross a border. Only `public-api.port.ts` may.

## Consequences

- **One decision is one edit.** Adding a field to the API means editing the
  entity, then one DTO file. The three hops that field travels through are
  consecutive lines in that file.
- **`ports/` means one thing again.** Every file under it names something the
  module needs from outside or offers to siblings. The folder listing is a list
  of dependencies, which is what a ports folder is for.
- **The big mapping file is gone.** `quiz.dto.ts` (285 lines) plus
  `ports/dto.port.ts` (82) became four files of 50–90 lines, each one model.
- **A module with one transfer model gets a folder holding one file.**
  `modules/generation/dto/generation.dto.ts` is the case. This is the same cost
  `ports/` already pays, and it is paid to keep one shape across every module
  rather than two.
- **"Where is this declared" is answered by the model, not the role.** A reader
  looking for `AttemptResultDto` opens `dto/attempt-result.dto.ts`. Previously
  they opened `ports/dto.port.ts` and scrolled — which was fine at 82 lines and
  would not have been at 300.
- **A cycle is now structurally impossible rather than avoided by convention.**
  The old arrangement was one careless import — an input type declared in
  `<module>.dto.ts` — away from a build failure that would have been confusing
  to diagnose. `DTO_ALLOWED` excluding `ports/` makes the direction explicit.

## Alternatives rejected

- **Fold `dto.port.ts` into `service.port.ts`.** Cheapest fix, no rule changes:
  the service's inputs already lived there, so its outputs joining them is
  coherent — `service.port.ts` would state the service's full signature.
  Rejected because it solves the "not a port" objection and neither of the other
  two: the types still sit apart from their mappings, and `quiz.dto.ts` stays at
  285 lines.
- **Keep one `<module>.dto.ts` and move the types into it.** Works for `article`
  and `generation`, and is the same idea as this ADR without the folder.
  Rejected on `quiz`, where it produces a single 360-line file — the problem the
  split was meant to fix.
- **Split by direction — `dto/quiz.input.ts` and `dto/quiz.dto.ts`.** Also
  breaks the cycle, and keeps `service.port.ts` holding the input types.
  Rejected because it puts `toCreateQuizInput` and `toQuizResponse` in different
  files while both describe the same model's edge, and it asks a reader to know
  a second taxonomy on top of the model name.
- **Let `dto/` files import `ports/` "just in case".** Rejected: the whole point
  of moving the inputs is that the dependency has one direction. Leaving the
  door open would let a repository query type drift into a wire contract.
- **A `dto/index.ts` barrel.** Rejected for the same reason ADR-0010 rejected
  `ports/index.ts`, and the repo has no barrel files by convention.
