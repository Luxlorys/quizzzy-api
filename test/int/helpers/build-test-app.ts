import { buildApp } from "@/app.js";
import { loadConfig } from "@/config.js";
import type { AppConfig } from "@/config.js";
import type { FastifyInstance } from "fastify";

/**
 * Builds the real application against this worker's database. Because config
 * is a plain value, a test can override any part of it — enable the docs
 * password, shrink the rate limit — without touching process.env or mocking.
 */
export const buildTestApp = async (
    overrides: Partial<AppConfig> = {},
): Promise<FastifyInstance> => {
    const config: AppConfig = {
        ...loadConfig(process.env),
        NODE_ENV: "test",
        ...overrides,
    };

    return buildApp(config);
};
