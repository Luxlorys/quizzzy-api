/**
 * The architecture, enforced. This file is the TypeScript equivalent of
 * import-linter contracts: every layering rule in ARCHITECTURE.md exists
 * here as a rule that fails CI (`npm run boundaries`).
 *
 * Layer map inside a module (dependencies point downward only):
 *
 *   index.ts                     composition root — may see everything in the module
 *   *.routes.ts, *.schema.ts     interface layer  — fastify + zod, calls the service
 *   <module>.service.ts          application      — entity + ports + dto + lib only
 *   <module>.<tech>.repository.ts implementation  — implements a persistence-shaped port
 *   <module>.<tech>.service.ts   implementation   — implements an external-service port
 *   ports/*.port.ts              ports + public API — types only, one file per role
 *   dto/*.dto.ts                 transfer models  — the type AND its mappings, plain TypeScript
 *   *.entity.ts, *.errors.ts     domain           — pure TypeScript
 *
 * Port implementations come in two families, and the suffix says which kind of
 * dependency is being inverted. A `.repository.ts` adapts something the module
 * STORES INTO and READS BACK — Prisma, Redis, the filesystem. A `.service.ts`
 * adapts an external CAPABILITY THE MODULE CALLS and gets an answer from —
 * Anthropic today, a mail or payments provider tomorrow. Both carry the
 * technology in the middle so it is visible at the composition root where it
 * is chosen.
 *
 * `<module>.service.ts` (one dot) is the application service; a two-dot
 * `<module>.<tech>.service.ts` is an adapter. The rules below tell them apart
 * with `[^/.]+` versus `[^/]+\.[^./]+`, so a service must never be named with
 * a dot in its stem unless it really is an adapter.
 *
 * Every abstract type the module owns lives under ports/, one file per role:
 *   - repository.port.ts, cache.port.ts, source.port.ts, lock.port.ts,
 *     generator.port.ts, tokens.port.ts — a PORT inverts an outbound
 *     dependency the module owns several implementations of. The module
 *     declares what it needs.
 *   - service.port.ts — the <Name>Service interface and its Deps. Its inputs
 *     and outputs are named from dto/, not declared here.
 *   - public-api.port.ts — the capability the module offers to siblings, in
 *     plain data over ids. This is the ONLY file another module may import,
 *     and `modules-are-islands` below enforces exactly that: with the public
 *     API in a file of its own, "a sibling imports the public API and nothing
 *     else" is a tool-checked rule rather than a convention. Keeping entities
 *     out of that file is still by hand.
 *
 * ADDING THINGS TO THIS FILE
 *
 * A new MODULE needs no change here at all: every rule matches
 * `src/modules/[^/]+/` and the file-role suffixes, never a module name.
 *
 * A new TECHNOLOGY needs one entry in the ADAPTERS table below — nothing else.
 * The table generates both rules that used to be written by hand per
 * technology: the layering rule that keeps the adapter under the service, and
 * the containment rule that keeps its SDK out of every other file. An adapter
 * whose technology is missing from the table fails
 * `adapter-technology-is-registered`, so a new SDK cannot slip in unpoliced by
 * being named something the file has never heard of.
 */

/** Every ports/*.port.ts file, in any module. */
const PORT_FILES = "^src/modules/[^/]+/ports/[^/]+\\.port\\.ts$";

/**
 * Every dto/*.dto.ts file, in any module: one transfer model per file, holding
 * the type AND the mappings around it. This layer sits between the domain and
 * ports/ — it imports the entity it maps from and nothing else in the module,
 * which is what lets service.port.ts name its inputs and outputs from here
 * without a cycle.
 */
const DTO_FILES = "^src/modules/[^/]+/dto/[^/]+\\.dto\\.ts$";

/** The one port file another module may import. */
const PUBLIC_API_FILE = "^src/modules/[^/]+/ports/public-api\\.port\\.ts$";

/** The application service — one dot in the stem, unlike a `<module>.<tech>.service.ts` adapter. */
const APPLICATION_SERVICE_FILE = "^src/modules/[^/]+/[^/.]+\\.service\\.ts$";

/** The pure lib files anything may import. */
const PURE_LIB = "^src/lib/(errors|clock|pagination)\\.ts$";

/** The article-text lib: a pure transformation the generation use case runs before it calls its generator, so the application service may import it and an adapter has no reason to. */
const ARTICLE_TEXT_LIB = "^src/lib/article-text\\.ts$";

/** What domain files (entities, errors) may depend on: each other and the pure lib files. */
const DOMAIN_ALLOWED = `^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|${PURE_LIB}`;

/** What a service may depend on: the domain, its ports, other modules' published APIs (also a ports/ file), its transfer models, other application services, pure lib, and the article-text lib. */
const SERVICE_ALLOWED = `^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|${APPLICATION_SERVICE_FILE}|${DTO_FILES}|${PORT_FILES}|${PURE_LIB}|${ARTICLE_TEXT_LIB}`;

/**
 * What a dto/*.dto.ts file may depend on: the domain it maps from, its sibling
 * transfer models, and pure lib. Notably NOT ports/ — the dependency runs the
 * other way, and a DTO that reached for a repository port would be reading
 * storage vocabulary into the wire contract. A service returns DTOs, so this
 * file has to stay as framework-free as the service — Zod in particular.
 */
const DTO_ALLOWED = `^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|${DTO_FILES}|${PURE_LIB}`;

/**
 * What a ports/*.port.ts file may depend on: the domain, its module's transfer
 * models (that is how service.port.ts names what the service takes and
 * returns), pure lib types, other port files in its own module, and other
 * modules' public-api.port.ts (that is how a consumer names a published API).
 * Never a framework, an SDK, a service or an implementation.
 */
const PORT_ALLOWED = `^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|${DTO_FILES}|${PORT_FILES}|${PURE_LIB}`;

/** What EVERY port implementation may depend on regardless of technology: the domain, the module's ports, pure lib. Never a DTO — an adapter speaks entities, because that is the vocabulary its port is written in. Its own SDK comes from its ADAPTERS entry. */
const IMPLEMENTATION_ALLOWED = `^src/modules/[^/]+/[^/]+\\.(entity|errors)\\.ts$|${PORT_FILES}|${PURE_LIB}`;

/**
 * Every file that implements a port — `<module>.<technology>.repository.ts` or
 * `<module>.<technology>.service.ts`, whatever the technology. Both require a
 * dot before the technology, which is what keeps `<module>.service.ts` (the
 * application service) out of this family. Matching the families rather than
 * listing them means a new implementation is covered by the composition-root
 * rule the day it is added, before anyone remembers to update this file.
 */
const IMPLEMENTATION_FILES = "\\.[^./]+\\.(repository|service)\\.ts$";

const IMPLEMENTATION_FILES_IN_MODULES = `^src/modules/[^/]+/[^/]+${IMPLEMENTATION_FILES}`;

/** Files that may name an SDK without adapting it: the type augmentation that declares the decoration, and tests. */
const SDK_ALWAYS_ALLOWED_IN = ["^src/types/fastify\\.d\\.ts$", "^test/"];

/**
 * Every technology this codebase adapts, one entry per technology. Each entry
 * generates a `<technology>-implementation-stays-below` layering rule and, when
 * the technology has an SDK to contain, a `<technology>-sdk-is-contained` rule.
 *
 *   technology     the middle segment of `<module>.<technology>.<family>.ts`
 *   family         "repository" for a store, "service" for a called capability
 *   sdk            path prefix of the SDK the adapter owns, or null for none
 *   sdkAlsoIn      non-adapter files allowed to name that SDK — the plugin that
 *                  owns the client lifecycle, and anything else specific to it
 *   alsoDependsOn  extra paths this adapter alone may reach for
 *   note           what the generated layering rule should say beyond the shared text
 */
const ADAPTERS = [
    {
        technology: "prisma",
        family: "repository",
        sdk: "^src/generated/",
        sdkAlsoIn: ["^src/plugins/database\\.ts$", "^src/generated/"],
        alsoDependsOn: [],
        note: "Test factories seed through Prisma on purpose.",
    },
    {
        technology: "cache",
        family: "repository",
        sdk: "^node_modules/ioredis",
        sdkAlsoIn: ["^src/plugins/redis\\.ts$"],
        alsoDependsOn: [],
        note:
            "It is a sibling of the Prisma repository, never a wrapper around it — a cache that " +
            "calls the database is a second service in disguise.",
    },
    {
        technology: "file",
        family: "repository",
        sdk: null,
        sdkAlsoIn: [],
        alsoDependsOn: [],
        note:
            "Its own dependency is node builtins, so there is no SDK twin rule to write — the " +
            "directory it writes to arrives from config at the composition root.",
    },
    {
        technology: "anthropic",
        family: "service",
        sdk: "^node_modules/@anthropic-ai",
        sdkAlsoIn: ["^src/plugins/anthropic\\.ts$"],
        alsoDependsOn: ["^node_modules/zod"],
        note:
            "It is a `.service.ts` rather than a `.repository.ts` because it adapts an external " +
            "capability the module calls, not a store it reads and writes. It is one model turn " +
            "plus a correction turn: text extraction, question planning, validation and the " +
            "correction budget are the service's (ADR-0012).",
    },
];

const adapterFiles = ({ technology, family }) =>
    `^src/modules/[^/]+/[^/]+\\.${technology}\\.${family}\\.ts$`;

const implementationStaysBelow = (adapter) => ({
    name: `${adapter.technology}-implementation-stays-below`,
    severity: "error",
    comment:
        `A ${adapter.technology} adapter implements a port from ports/; it may not reach up into ` +
        "the application service, routes or schemas, and it may not import Fastify or another " +
        `technology's SDK. ${adapter.note}`,
    from: { path: adapterFiles(adapter) },
    to: {
        pathNot: [
            IMPLEMENTATION_ALLOWED,
            ...(adapter.sdk ? [adapter.sdk] : []),
            ...adapter.alsoDependsOn,
        ].join("|"),
        dependencyTypesNot: ["core"],
    },
});

const sdkIsContained = (adapter) => ({
    name: `${adapter.technology}-sdk-is-contained`,
    severity: "error",
    comment:
        `${adapter.sdk} may be imported only by *.${adapter.technology}.${adapter.family}.ts ` +
        "files, the plugin that owns its client lifecycle, the fastify type augmentation, and " +
        "tests. Everything else programs against a port.",
    from: {
        pathNot: [
            adapterFiles(adapter),
            ...adapter.sdkAlsoIn,
            ...SDK_ALWAYS_ALLOWED_IN,
        ].join("|"),
    },
    to: { path: adapter.sdk },
});

const adapterRules = [
    ...ADAPTERS.map(implementationStaysBelow),
    ...ADAPTERS.filter((adapter) => adapter.sdk !== null).map(sdkIsContained),
];

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
                "is behind either. This is what keeps use cases unit-testable with in-memory ports. " +
                "This rule matches `<module>.service.ts` only — a two-dot `<module>.<tech>.service.ts` " +
                "is an adapter and answers to its own SDK rule instead.",
            from: { path: APPLICATION_SERVICE_FILE },
            to: { pathNot: SERVICE_ALLOWED },
        },
        {
            name: "dto-stays-pure",
            severity: "error",
            comment:
                "A dto/*.dto.ts holds one transfer model — its type, the input it is built from, and " +
                "every mapping around it: wire → input, domain → DTO, DTO → wire. Because the service " +
                "imports it, it must stay plain TypeScript: no Zod, no Fastify, no SDK, no port " +
                "implementation — and no ports/ either, since ports/ depends on this layer, not the " +
                "other way round. The wire contract stays in *.schema.ts and type-checks toXResponse " +
                "where the route returns it.",
            from: { path: DTO_FILES },
            to: { pathNot: DTO_ALLOWED },
        },
        {
            name: "port-is-types-only",
            severity: "error",
            comment:
                "A ports/*.port.ts file holds abstract types and nothing else — one file per role: " +
                "repository, cache, source, lock, generator, tokens, service, and the " +
                "public-api.port.ts siblings import. It speaks the module's domain and transfer " +
                "vocabulary only: " +
                "no frameworks, no SDKs. public-api.port.ts must stay plain data over ids: this rule " +
                "cannot see inside the file, so keep entities out of it by hand.",
            from: { path: PORT_FILES },
            to: { pathNot: PORT_ALLOWED },
        },
        ...adapterRules,
        {
            name: "adapter-technology-is-registered",
            severity: "error",
            comment:
                "This file is named like a port implementation but its technology is not in the " +
                "ADAPTERS table in .dependency-cruiser.cjs, so no layering rule and no SDK " +
                "containment rule covers it. Add the entry — technology, family, the SDK it owns " +
                "and the plugin that holds that client — and the rules generate themselves.",
            from: {
                path: IMPLEMENTATION_FILES_IN_MODULES,
                pathNot: ADAPTERS.map(adapterFiles).join("|"),
            },
            to: { path: ".*" },
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
                "A module may import exactly one FILE from another module: its " +
                "ports/public-api.port.ts. Everything else in that folder — entity, errors, the other " +
                "port files, service, implementations — is private. With the published API in a file " +
                "of its own, this is now an enforced rule rather than a convention: taking a " +
                "repository port or a transfer model across a border fails here. The implementation " +
                "still arrives " +
                "as a decoration wired in index.ts (see docs/recipes.md); the type is all that crosses.",
            from: { path: "^src/modules/([^/]+)/" },
            to: {
                path: "^src/modules/",
                pathNot: `^src/modules/$1/|${PUBLIC_API_FILE}`,
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
        // (prisma-sdk-is-contained), its internals are not analyzed.
        doNotFollow: { path: "node_modules|^src/generated" },
        tsConfig: { fileName: "tsconfig.json" },
        // Count type-only imports as dependencies: an `import type` across a
        // boundary is still coupling.
        tsPreCompilationDeps: true,
    },
};
