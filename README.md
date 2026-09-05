# Fastify Clean Template

A Fastify + TypeScript backend template with a **pragmatic clean architecture**:
the _rules_ of Clean Architecture that pay for themselves (framework-free core,
ports at the I/O boundary, one place per concern), delivered through _Fastify's
own idioms_ (plugins, decorators, encapsulation) instead of a parallel DI
framework. Every architectural rule is enforced by a tool, not a README.

## Stack

| Concern              | Choice                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| HTTP                 | [Fastify 5](https://fastify.dev)                                                                                      |
| Language             | TypeScript (strict, ESM, NodeNext)                                                                                    |
| Validation + OpenAPI | [Zod 4](https://zod.dev) via `fastify-type-provider-zod` — one schema validates _and_ documents                       |
| Database             | PostgreSQL + [Prisma 7](https://www.prisma.io) (driver adapter, generated client in `src/generated/`)                 |
| Object storage       | S3 API via `@aws-sdk/client-s3` behind a module port — [MinIO](https://min.io) stands in for AWS in tests             |
| Tests                | [Vitest](https://vitest.dev) — unit lane (no infra) + integration lane ([Testcontainers](https://testcontainers.com)) |
| Boundaries           | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — the architecture as CI-enforced rules          |
| Lint / format        | ESLint (type-aware, tests included) + Prettier                                                                        |
| Workflow             | Husky + lint-staged + commitlint (Conventional Commits)                                                               |

## Quickstart

```bash
npm install
cp .env.example .env
docker compose up -d postgres     # local database only; the app runs on the host
npx prisma migrate dev            # apply migrations
npm run dev                       # http://localhost:3000/docs
```

Run everything the CI runs:

```bash
npm run check       # typecheck + lint + boundaries + unit tests
npm run test:int    # integration tests — needs Docker, nothing else
```

## Layout

```
src/
├── config.ts                  # env → typed AppConfig (Zod, fails fast)
├── app.ts                     # composition root: plugins/ autoloaded, modules in order
├── server.ts                  # entrypoint: load env, build, listen, graceful close
├── lib/                       # shared, framework-free first: errors, clock, pagination
├── plugins/                   # infrastructure: autoloaded by app.ts — a file here is registered
├── modules/                   # one folder per domain capability — see below
│   ├── health/                # smallest possible module: one file
│   ├── task/                  # the reference module (publishes taskService)
│   ├── user/                  # publisher module + S3 avatar storage (port/adapter example)
│   └── onboarding/            # consumer module: cross-module workflow via ports
└── generated/prisma/          # generated client (gitignored)
```

Inside a module, files are named by their **layer**, and the layers may only
point downward — enforced by `npm run boundaries`:

```
modules/task/
├── index.ts                   # composition root: implementations → service → routes
├── task.routes.ts             # HTTP: schemas on routes, thin inline handlers
├── task.schema.ts             # the wire contract (Zod: validated in, documented out)
├── task.ports.ts              # EVERY abstract type: ports, DTO, service, public API
├── task.dto.ts                # the mappings: wire → input, domain → DTO → wire
├── task.service.ts            # use cases (no fastify, no zod, no prisma, no redis)
├── task.prisma.repository.ts  # implements TaskRepository — the only file with Prisma
├── task.cache.repository.ts   # implements TaskCache — the only file with ioredis
├── task.entity.ts             # domain types + business rules, pure TypeScript
└── task.errors.ts             # the module's named errors (no status codes)
```

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design and the
reasoning; [docs/adr/](./docs/adr/) for why each decision was made over its
alternatives; [docs/recipes.md](./docs/recipes.md) for the patterns the
template deliberately ships as documentation instead of dead code (auth,
transactions, typed JSON columns).

## Tests

| Lane                 | Command             | Runs against                                 | Needs   |
| -------------------- | ------------------- | -------------------------------------------- | ------- |
| Unit: domain rules   | `npm run test:unit` | entities directly                            | nothing |
| Unit: use cases      | `npm run test:unit` | in-memory port implementations + fixed clock | nothing |
| Unit: caching policy | `npm run test:unit` | in-memory repository + in-memory cache       | nothing |
| Integration: ports   | `npm run test:int`  | real PostgreSQL, Redis, S3 (MinIO)           | Docker  |
| Integration: HTTP    | `npm run test:int`  | the real app via `app.inject()`              | Docker  |

The integration lane boots one throwaway Postgres per run, migrates a template
database once, clones one database per Vitest worker, and truncates between
tests — fast, parallel, and isolated. See `test/int/setup/`.

## Scripts

| Script                             | What it does                                              |
| ---------------------------------- | --------------------------------------------------------- |
| `npm run dev`                      | Watch mode (generates the Prisma client first)            |
| `npm run check`                    | Typecheck + lint + boundaries + unit tests                |
| `npm run boundaries`               | Verify the architecture rules (dependency-cruiser)        |
| `npm run build` / `start`          | Compile to `dist/` and run it                             |
| `npm run prisma:migrate:create`    | Write a migration without applying (review the SQL first) |
| `npm run prisma:migrate:apply`     | Create + apply migrations in dev                          |
| `docker compose --profile full up` | Full stack in containers (migrations applied on boot)     |
