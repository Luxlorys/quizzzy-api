# CLAUDE.md — Project rules for Claude Code

Fastify 5 + TypeScript backend template: pragmatic clean architecture in
vertical feature modules, Prisma 7 (PostgreSQL), Zod validation, no DI
container, boundaries enforced by dependency-cruiser.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the design, [docs/adr/](./docs/adr/)
for why it is this way, [docs/recipes.md](./docs/recipes.md) before adding
auth, storage SDKs, transactions or JSON columns — the pattern you need is
probably specified there.

## Working with the user

Do what was asked — the requested scope is the deliverable. Do not propose
alternative approaches, refactors, or "better" designs alongside the work, and
do not append options the user did not ask about. Give advice only when the
user explicitly asks for it. If the request is genuinely ambiguous or a rule
here blocks it, ask one direct question instead of guessing or offering a menu.

## Commands

```bash
npm run check        # typecheck + lint + boundaries + unit tests — run before saying you are done
npm run test:int     # integration tests (needs Docker running, nothing else)
npm run dev          # local server; DB via: docker compose up -d postgres

# Migrations: edit prisma/schema.prisma, then
npm run prisma:migrate:create   # writes SQL without applying — review it
npm run prisma:migrate:apply
```

## Hard rules

Most layering rules are _enforced_ — `npm run boundaries` fails on violations,
so work with the rules rather than around them. If a rule seems to block the
task, stop and ask; do not add exemptions to `.dependency-cruiser.cjs`.

1. **Follow the file roles.** Inside `src/modules/<name>/`: `*.entity.ts` /
   `*.errors.ts` (pure domain), `ports/*.port.ts` (**every** abstract type the
   module owns, **one file per role** — `repository.port.ts`, `cache.port.ts`
   and one file per further outbound dependency named for what it inverts
   (`source`, `lock`, `generator`, `tokens`, …); `dto.port.ts` for the
   `<Name>Dto` family; `service.port.ts` for the input types plus the
   `<Name>Service` interface and its `Deps`; and `public-api.port.ts` holding
   `<Name>PublicApi`, the only file other modules may import),
   `*.prisma.repository.ts` / `*.cache.repository.ts` / `*.s3.repository.ts` /
   `*.anthropic.service.ts` (implementations of those ports),
   `<module>.service.ts` (use cases), `*.dto.ts` (the mappings across the
   interface ↔ application boundary: `toXInput` wire → service input,
   `toXDto` domain → DTO, `toXResponse` DTO → wire),
   `*.schema.ts` + `*.routes.ts` (interface), `index.ts` (wiring). The
   boundary rules match on these names — a file outside the convention
   silently escapes its layer's checks.
   1a. **Port implementations come in two families** (ADR-0010). One that adapts
   something the module **stores into and reads back** is
   `<module>.<technology>.repository.ts` (Prisma, Redis, filesystem, S3); one
   that adapts an **external capability the module calls** and gets an answer
   from is `<module>.<technology>.service.ts` (`generation.anthropic.service.ts`).
   `<module>.service.ts` — one dot — is the application service and may never
   import an SDK; a two-dot `<module>.<tech>.service.ts` is an adapter and may.
   The rules tell them apart by that dot alone, so **never put a dot in an
   application service's stem**. A new technology (mail, search, …) means a
   `*.port.ts` file named for the capability, an implementation in whichever
   family fits, and **one row in the `ADAPTERS` table** in
   `.dependency-cruiser.cjs` — technology, family, the SDK it owns, the plugin
   holding that client — which generates both boundary rules. Leaving the row
   out is not a way to skip the rules: an adapter whose technology is not in the
   table fails `adapter-technology-is-registered`.
   1b. **Cross-module use goes through the provider's published API.** A module
   offering a capability declares `<Name>PublicApi` alone in its
   `ports/public-api.port.ts` (pure types over ids and plain inputs, no
   entities) and publishes its service as a decoration (see
   `modules/article/index.ts` — fp-wrapped, mounts its own prefix). The
   decoration is typed as **the published API, not the service**, in
   `src/types/fastify.d.ts` — that is what stops unrelated modules reaching into
   it. A consumer imports that type directly from the provider's
   `ports/public-api.port.ts` and wires `fastify.<x>Service` in its `index.ts`.
   `modules-are-islands` admits **only** that file across a border, so taking a
   sibling's repository port or DTO fails the build; what is still on you is
   keeping entities out of the published file. Never re-declare a provider's
   signature as a port of your own: ports are for infrastructure you implement
   several ways, the published API is for a capability another module owns.
   Entities never cross module borders — ids and plain inputs do.
2. **SDKs only in port implementations.** Prisma lives in
   `*.prisma.repository.ts` (plus `plugins/database.ts` and test factories);
   `ioredis` lives in `*.cache.repository.ts` (plus `plugins/redis.ts`);
   `@aws-sdk/*` lives in `*.s3.repository.ts` (plus `plugins/s3.ts`);
   `@anthropic-ai/sdk` lives in `*.anthropic.service.ts` (plus
   `plugins/anthropic.ts`). Application services never see SDK types; ports
   speak the module's vocabulary — purpose in the port (`uploadAvatar`,
   `read`/`write`/`forget`, `generate`), technology in the implementation
   (buckets, keys, commands, TTLs, models, prompts).
   2a. **Implementations are siblings, never nested.** The cache repository
   implements the cache port and talks to Redis only; it never wraps or calls
   the Prisma repository, and no `*.repository.cached.ts` middle file exists.
   The service holds both ports and decides which one each use case reads —
   the cache policy is readable in the use case that owns it, not hidden in a
   decorator. `index.ts` is still the only file that picks the
   implementations. Invalidate on the write path, cache entities by id, never
   cache paginated lists, and version the key prefix so a shape change cannot
   meet an old blob. The implementation — not the service — is where a cache
   outage is swallowed.
   2b. **Cache queries, never the read a command writes back.** In a caching
   service, a query (`getTask`) reads `cache` first and falls back to
   `repository`; a command (`completeTask`) reads `repository` directly and
   `cache.forget`s after the save. Invalidating on write does not make a
   cached command-read safe: a reader that missed can fill the cache after a
   concurrent save already called `forget`, leaving a stale entry for a full
   TTL. A command loading that entry evaluates its rules against a dead state
   and then writes the whole stale entity back. A stale query is the trade;
   a stale write is data loss. Copy this split into every module that
   caches.
3. **Services stay framework-free**: no Fastify, no Zod, no HTTP concepts, no
   status codes, no wire envelopes. Inputs/outputs are the service's own
   declared types.
   3a. **Nothing crosses to or from a route unmapped.** A handler passes
   `toXInput(request.body)` — never `request.body`, never an object it built
   inline — and returns `toXResponse(dto)`. A bare scalar
   (`service.getTask(request.params.id)`) is the only thing that crosses as
   itself: there is no model to convert.
   3b. **Services return DTOs, never entities.** Every use case ends in
   `toXDto()`; the entity is the currency inside the service and stops there,
   so no route and no sibling module can read a field the module did not
   publish. `*.dto.ts` owns both hops — `toXDto` and `toXResponse` — and stays
   plain TypeScript, so it may not import Zod or Fastify (`dto-stays-pure`).
   The route calls `toXResponse` and its response schema type-checks the
   result; that is what keeps the wire contract and the mapper in sync, so
   `toXResponse` never declares the Zod-inferred response type itself. DTOs
   carry `Date`s — serialization happens at the wire hop only.
4. **Errors**: throw named module errors from `*.errors.ts` subclassing
   `lib/errors.ts`. Never attach status codes outside
   `plugins/error-handler.ts`; never format error bodies in handlers.
5. **No mocking framework.** Unit tests substitute port _implementations_
   (in-memory repository, in-memory cache, fixed clock) — extend those when a
   port grows. When a port's semantics change, update the real
   implementation's integration test AND the in-memory one together.
6. **Migrations only via `prisma:migrate:create`** — never hand-write or edit
   files under `prisma/migrations/` (exception: a backfill or custom SQL the
   schema cannot express, after the file is generated). Review generated SQL
   before applying; if it is destructive, stop and ask.
7. **Every list endpoint is paginated** (cursor pattern in `lib/pagination.ts`
   — copy the task module's `list`).
8. **Time comes from the Clock port** in services/entities — never
   `new Date()` there (routes/adapters may, for infrastructure purposes).
9. **New env vars** go into the Zod schema in `src/config.ts` (type is
   inferred — never hand-write a config type) and `.env.example`.
10. **Integration tests**: arrange with factories in `test/int/factories/`,
    never hardcode row ids (TRUNCATE restarts sequences — read ids off the
    factory's return), keep a multi-step journey inside a single `it`.
11. **No comments in code** — neither inline (`//`, `/* */`) nor JSDoc
    (`/** */`), unless the user explicitly asks for them. Names and structure
    carry the explanation; put the "why" in the commit message, an ADR or
    [docs/recipes.md](./docs/recipes.md). Never add comments to code you touch
    in passing, and never restore ones you removed.

## Conventions

- ESM with NodeNext: relative imports end in `.js`; `@/` aliases `src/`.
- `import type` for type-only imports (`verbatimModuleSyntax` enforces it).
- Factory functions over classes everywhere except error types.
- Handlers are thin inline functions in `*.routes.ts` — parse is the schema's
  job, logic is the service's, DTO→wire mapping is `toXResponse`'s. A handler
  never sees an entity.
- Conventional Commits (commitlint enforces).
- No barrel files; a module's `index.ts` is its plugin/composition root, not
  a re-export hub.
- Adding a feature: follow ARCHITECTURE.md §6 inside-out; `modules/task/` is
  the reference slice. Copy its shape, including its four test files.
