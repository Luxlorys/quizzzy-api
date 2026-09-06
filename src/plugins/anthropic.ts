import Anthropic from "@anthropic-ai/sdk";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

const anthropic = async (fastify: FastifyInstance) => {
    const client = new Anthropic({
        apiKey: fastify.config.ANTHROPIC_API_KEY,
        maxRetries: fastify.config.ANTHROPIC_MAX_RETRIES,
        timeout: fastify.config.ANTHROPIC_REQUEST_TIMEOUT_MS,
    });

    fastify.decorate("anthropic", client);
};

export default fp(anthropic, { name: "anthropic" });
