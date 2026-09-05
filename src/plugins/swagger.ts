import fp from "fastify-plugin";
import basicAuth from "@fastify/basic-auth";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { UnauthorizedError } from "@/lib/errors.js";
import type { FastifyInstance } from "fastify";

export const DOCS_ROUTE_PREFIX = "/docs";

const DOCS_USERNAME = "docs";

/**
 * OpenAPI documentation generated from the same Zod schemas that validate
 * requests — the docs cannot drift from the behavior. When DOCS_PASSWORD is
 * set, the UI and the JSON spec sit behind basic auth (username "docs").
 */
const swaggerDocs = async (fastify: FastifyInstance) => {
    await fastify.register(swagger, {
        openapi: {
            openapi: "3.0.3",
            info: {
                title: "API",
                version: "1.0.0",
            },
        },
        transform: jsonSchemaTransform,
    });

    const docsPassword = fastify.config.DOCS_PASSWORD;

    if (docsPassword !== undefined) {
        await fastify.register(basicAuth, {
            validate: (username, password, _request, _reply, done) => {
                if (username === DOCS_USERNAME && password === docsPassword) {
                    done();

                    return;
                }

                done(new UnauthorizedError("Invalid documentation credentials."));
            },
            authenticate: true,
        });
    }

    await fastify.register(swaggerUi, {
        routePrefix: DOCS_ROUTE_PREFIX,
        uiHooks: {
            onRequest: docsPassword !== undefined ? fastify.basicAuth : undefined,
        },
    });
};

// The `dependencies` entry is what keeps /docs behind the global rate limit:
// @fastify/rate-limit only covers routes registered after it, and autoload
// orders plugins alphabetically. Naming security here hoists it ahead of this
// plugin, so the ordering is a stated requirement rather than a coincidence of
// filenames — and renaming either file becomes safe.
export default fp(swaggerDocs, {
    name: "swagger-docs",
    dependencies: ["security"],
});
