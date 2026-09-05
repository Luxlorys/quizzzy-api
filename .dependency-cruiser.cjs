/**
 * The architecture, enforced. This file is the TypeScript equivalent of
 * import-linter contracts: every layering rule in ARCHITECTURE.md exists
 * here as a rule that fails CI (`npm run boundaries`).
 *
 * Layer map inside a module (dependencies point downward only):
 *
 *   index.ts                 composition root — may see everything in the module
 *   *.routes.ts, *.schema.ts interface layer  — fastify + zod, calls the service
 *   *.dto.ts                 transfer mappings — domain → DTO → wire, plain TypeScript
 *   *.service.ts             application      — entity + ports + dto + lib only
 *   *.prisma.repository.ts   implementation   — implements a repository port, owns Prisma
 *   *.cache.repository.ts    implementation   — implements a cache port, owns ioredis
 *   *.s3.repository.ts       implementation   — implements a storage port, owns @aws-sdk
 *   *.ports.ts               ports + public API — types only; EVERY abstract type the
 *                                                module owns, and the ONLY file other
 *                                                modules may import
 *   *.entity.ts, *.errors.ts domain           — pure TypeScript
 *
 * Every port implementation is named `<module>.<technology>.repository.ts`:
 * one role suffix for the whole family, with the technology in the middle so
 * it is visible at the composition root where it is chosen. Each technology
 * gets its own rule below, because each is allowed a different SDK.
 *
 * *.ports.ts carries two jobs, so keep them visibly separate inside the file:
 *   - a PORT inverts an outbound dependency the module owns several
 *     implementations of (Prisma, Redis, S3, in-memory, …). The module
 *     declares what it needs.
 *   - the PUBLIC API publishes a capability the module offers to siblings. The
 *     module declares what it gives, in plain data over ids — never entities.
 *
 * Because both live in one file, `modules-are-islands` below can only police
 * WHICH FILE crosses a module border, not which type inside it. "A sibling
 * imports the public API and nothing else" is therefore a convention here,
 * not an enforced rule. If that starts to leak, split the public API back
 * into its own *.contract.ts and give it its own rule.
 */

/** What domain files (entities, errors) may depend on: each other and the pure lib files. */
const DOMAIN_ALLOWED =
    "^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|^src/lib/(errors|clock|pagination)\\.ts$";

/** What a service may depend on: the domain, its ports, other modules' published APIs (also *.ports.ts), its DTO mappings, other services in its module, pure lib. */
const SERVICE_ALLOWED =
    "^src/modules/[^/]+/[^/]+\\.(entity|errors|service|ports|dto)\\.ts$|^src/lib/(errors|clock|pagination)\\.ts$";

/**
 * What a *.dto.ts file may depend on: the domain it maps from, the *.ports.ts
 * that declares the DTO type, and pure lib. A service returns DTOs, so this
 * file has to stay as framework-free as the service — Zod in particular.
 */
const DTO_ALLOWED =
    "^src/modules/[^/]+/[^/]+\\.(entity|errors|ports|dto)\\.ts$|^src/lib/(errors|clock|pagination)\\.ts$";

/**
 * What a *.ports.ts file may depend on: the domain, pure lib types, and other
 * modules' *.ports.ts (that is how a consumer names a published API). Never a
 * framework, an SDK, a service or an implementation.
 */
const PORT_ALLOWED =
    "^src/modules/[^/]+/[^/]+\\.(entity|errors|ports)\\.ts$|^src/lib/(errors|clock|pagination)\\.ts$";

/** What every port implementation may depend on: the domain, the module's ports, pure lib. Its own SDK is added per rule below. */
const IMPLEMENTATION_ALLOWED =
    "^src/modules/[^/]+/[^/]+\\.(entity|errors|ports)\\.ts$|^src/lib/(errors|clock|pagination)\\.ts$";

/** The Prisma implementation of a repository port. */
const PRISMA_IMPLEMENTATION_ALLOWED = `${IMPLEMENTATION_ALLOWED}|^src/generated/`;

/** The Redis implementation of a cache port. */
const CACHE_IMPLEMENTATION_ALLOWED = `${IMPLEMENTATION_ALLOWED}|^node_modules/ioredis`;

/** The S3 implementation of a storage port (node builtins are exempted in the rule itself). */
const S3_IMPLEMENTATION_ALLOWED = `${IMPLEMENTATION_ALLOWED}|^node_modules/@aws-sdk`;

/**
 * Every file that implements a port — `<module>.<technology>.repository.ts`,
 * whatever the technology. Matching the family rather than listing it means a
 * new implementation is covered by the composition-root rule the day it is
 * added, before anyone remembers to update this file.
 */
const IMPLEMENTATION_FILES = "\\.[^./]+\\.repository\\.ts$";

module.exports = {
    forbidden: [
        {
            name: "no-circular",
            severity: "error",
            comment: "Circular dependencies make change risky and tests slow.",
            from: { pathNot: "^src/generated" },
            to: { circular: true, pathNot: "^src/generated" },
        },
        {
            name: "domain-stays-pure",
            severity: "error",
            comment:
                "Entities and domain errors are plain TypeScript: no Fastify, no Zod, no Prisma, no plugins. " +
                "If a rule needs infrastructure, it belongs in the service; if it needs the wire format, in the schema.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$" },
            to: { pathNot: DOMAIN_ALLOWED },
        },
        {
            name: "service-sees-no-infrastructure",
            severity: "error",
            comment:
                "Services depend on ports and entities, never on Fastify, Zod, Prisma, ioredis, a port " +
                "implementation, routes or schemas. A service holds the repository port AND the cache " +
                "port and decides which one each use case reads — but it never learns which technology " +
                "is behind either. This is what keeps use cases unit-testable with in-memory ports.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.service\\.ts$" },
            to: { pathNot: SERVICE_ALLOWED },
        },
        {
            name: "dto-stays-pure",
            severity: "error",
            comment:
                "A *.dto.ts holds the two mappings around the transfer model — domain → DTO, which the " +
                "service calls, and DTO → wire, which the route calls. Because the service imports it, " +
                "it must stay plain TypeScript: no Zod, no Fastify, no SDK, no port implementation. " +
                "The wire contract stays in *.schema.ts and type-checks toXResponse where the route " +
                "returns it.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.dto\\.ts$" },
            to: { pathNot: DTO_ALLOWED },
        },
        {
            name: "port-is-types-only",
            severity: "error",
            comment:
                "A *.ports.ts file holds every abstract type the module owns — repository, cache, " +
                "storage, and the public API siblings import — and speaks the module's domain " +
                "vocabulary only: no frameworks, no SDKs. The public API section must stay plain " +
                "data over ids: this rule cannot see inside the file, so keep entities out of it " +
                "by hand.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.ports\\.ts$" },
            to: { pathNot: PORT_ALLOWED },
        },
        {
            name: "prisma-implementation-stays-below",
            severity: "error",
            comment:
                "A Prisma repository implements a port from *.ports.ts; it may not reach up into " +
                "services, routes or schemas, and it may not import Fastify.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.prisma\\.repository\\.ts$" },
            to: { pathNot: PRISMA_IMPLEMENTATION_ALLOWED },
        },
        {
            name: "cache-implementation-stays-below",
            severity: "error",
            comment:
                "A cache repository implements a cache port from *.ports.ts; it may not reach up into " +
                "services, routes or schemas, and it may not import Fastify or Prisma. It is a sibling " +
                "of the Prisma repository, never a wrapper around it — a cache that calls the database " +
                "is a second service in disguise.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.cache\\.repository\\.ts$" },
            to: {
                pathNot: CACHE_IMPLEMENTATION_ALLOWED,
                dependencyTypesNot: ["core"],
            },
        },
        {
            name: "s3-implementation-stays-below",
            severity: "error",
            comment:
                "An S3 repository implements a storage port; it may not reach up into services, " +
                "routes or schemas, and it may not import Fastify or Prisma.",
            from: { path: "^src/modules/[^/]+/[^/]+\\.s3\\.repository\\.ts$" },
            to: {
                pathNot: S3_IMPLEMENTATION_ALLOWED,
                dependencyTypesNot: ["core"],
            },
        },
        {
            name: "redis-only-in-cache-implementations",
            severity: "error",
            comment:
                "ioredis may be imported only by *.cache.repository.ts files, the redis plugin " +
                "(client lifecycle), the fastify type augmentation, and tests. Everything else " +
                "programs against a port — the cache twin of prisma-only-in-repositories.",
            from: {
                pathNot:
                    "\\.cache\\.repository\\.ts$|^src/plugins/redis\\.ts$|^src/types/fastify\\.d\\.ts$|^test/",
            },
            to: { path: "^node_modules/ioredis" },
        },
        {
            name: "aws-sdk-only-in-s3-implementations",
            severity: "error",
            comment:
                "The AWS SDK may be imported only by *.s3.repository.ts files, the s3 plugin " +
                "(client lifecycle), the fastify type augmentation, and tests. Everything else " +
                "programs against a port — the storage twin of prisma-only-in-repositories.",
            from: {
                pathNot:
                    "\\.s3\\.repository\\.ts$|^src/plugins/s3\\.ts$|^src/types/fastify\\.d\\.ts$|^test/",
            },
            to: { path: "^node_modules/@aws-sdk" },
        },
        {
            name: "prisma-only-in-repositories",
            severity: "error",
            comment:
                "The generated Prisma client may be imported only by *.prisma.repository.ts files, the database plugin, " +
                "the fastify type augmentation, and tests (factories seed through Prisma on purpose).",
            from: {
                pathNot:
                    "^src/modules/[^/]+/[^/]+\\.prisma\\.repository\\.ts$|^src/plugins/database\\.ts$|^src/types/fastify\\.d\\.ts$|^src/generated/|^test/",
            },
            to: { path: "^src/generated/" },
        },
        {
            name: "implementations-composed-only-at-the-root",
            severity: "error",
            comment:
                "Only a module's index.ts (its composition root) and tests may instantiate a port " +
                "implementation. Everything else — the service included — programs against the port. " +
                "This is also what stops one implementation importing another: a cache repository that " +
                "reached for the Prisma repository would be composing, and composing happens here.",
            from: { pathNot: "(^|/)index\\.ts$|^test/" },
            to: { path: IMPLEMENTATION_FILES },
        },
        {
            name: "modules-are-islands",
            severity: "error",
            comment:
                "A module may import exactly one FILE from another module: its *.ports.ts, and from it " +
                "only the published public API type. Everything else in that folder — entity, errors, " +
                "service, implementations — is private. The implementation still arrives as a decoration " +
                "wired in index.ts (see docs/recipes.md); the type is all that crosses the border.",
            from: { path: "^src/modules/([^/]+)/" },
            to: {
                path: "^src/modules/",
                pathNot: "^src/modules/$1/|^src/modules/[^/]+/[^/]+\\.ports\\.ts$",
            },
        },
        {
            name: "lib-is-standalone",
            severity: "error",
            comment:
                "lib is shared by everything, so it may depend on nothing above itself.",
            from: { path: "^src/lib/" },
            to: { path: "^src/(modules|plugins)/|^src/(app|server)\\.ts$" },
        },
        {
            name: "plugins-do-not-reach-into-modules",
            severity: "error",
            comment:
                "Infrastructure plugins are module-agnostic; only app.ts composes modules.",
            from: { path: "^src/plugins/" },
            to: { path: "^src/modules/" },
        },
    ],
    options: {
        // Generated Prisma code is a black box: edges INTO it are checked
        // (prisma-only-in-repositories), its internals are not analyzed.
        doNotFollow: { path: "node_modules|^src/generated" },
        tsConfig: { fileName: "tsconfig.json" },
        // Count type-only imports as dependencies: an `import type` across a
        // boundary is still coupling.
        tsPreCompilationDeps: true,
    },
};
