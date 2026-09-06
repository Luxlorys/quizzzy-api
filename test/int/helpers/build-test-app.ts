import { buildApp } from "@/app.js";
import { loadConfig } from "@/config.js";
import type { BuildAppOverrides } from "@/app.js";
import type { AppConfig } from "@/config.js";
import type { FastifyInstance } from "fastify";

/**
 * Builds the real application against this worker's database. Because config
 * is a plain value, a test can override any part of it — enable the docs
 * password, shrink the rate limit — without touching process.env or mocking.
 * `appOverrides` swaps an internal dependency (e.g. a stub QuizGenerator) so a
 * generation test can exercise the real lock and database without a real
 * Anthropic call.
 */
export const buildTestApp = async (
    overrides: Partial<AppConfig> = {},
    appOverrides: BuildAppOverrides = {},
): Promise<FastifyInstance> => {
    const config: AppConfig = {
        ...loadConfig(process.env),
        NODE_ENV: "test",
        ...overrides,
    };

    return buildApp(config, appOverrides);
};
