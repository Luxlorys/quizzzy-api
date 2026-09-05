import fp from "fastify-plugin";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

/**
 * Edge protection for every route: CORS, security headers, rate limiting.
 * Grouped because they are configured once and never referenced again.
 */
const security = async (fastify: FastifyInstance) => {
    await fastify.register(cors, {
        origin: true,
        credentials: true,
    });

    await fastify.register(helmet, {
        // This API serves JSON; a CSP would only apply to the Swagger UI
        // pages and the default policy breaks their inline scripts.
        contentSecurityPolicy: false,
    });

    await fastify.register(rateLimit, {
        max: fastify.config.RATE_LIMIT_MAX,
        timeWindow: "1 minute",
    });
};

export default fp(security, { name: "security" });
