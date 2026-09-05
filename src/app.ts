import path from "node:path";
import { fileURLToPath } from "node:url";
import autoload from "@fastify/autoload";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { loggerFor } from "./lib/logger.js";
import articleModule from "./modules/article/index.js";
import { healthModule } from "./modules/health/index.js";
import { quizModule } from "./modules/quiz/index.js";
import type { AppConfig } from "./config.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The application's composition root. Everything the app is made of is
 * registered here, in an order you can read top to bottom: infrastructure
 * plugins, then publisher modules (they decorate the instance with their
 * services and mount their own prefixes), then consumer modules.
 *
 * Config comes in as a value, so tests can build the app with any
 * configuration (see test/int/helpers/build-test-app.ts) — no environment
 * mutation, no mocking.
 */
export const buildApp = async (config: AppConfig): Promise<FastifyInstance> => {
    const app = Fastify({
        logger: loggerFor(config.NODE_ENV),
    });

    app.decorate("config", config);

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Infrastructure plugins are uniform — every one of them is fastify-plugin
    // wrapped, reads only `app.config`, and decorates the instance — so they
    // are loaded by directory rather than listed. Adding one is adding a file.
    //
    // Autoload's order is alphabetical UNLESS a plugin declares `dependencies`
    // in its fastify-plugin metadata, which hoists what it names. An ordering
    // requirement therefore has to be written down in the plugin that has it
    // (see plugins/swagger.ts) — it can no longer live in this file's line
    // order, where it would be invisible and one rename away from breaking.
    await app.register(autoload, {
        dir: path.join(__dirname, "plugins"),
        forceESM: true,
    });

    // Publishers first — consumers below read their decorations.
    await app.register(articleModule); // mounts /api/articles

    await app.register(healthModule, { prefix: "/health" });
    await app.register(quizModule); //   mounts /api/quizzes and /api/attempts

    await app.ready();

    return app;
};
