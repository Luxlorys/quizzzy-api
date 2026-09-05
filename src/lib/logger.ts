import type { FastifyServerOptions } from "fastify";
import type { AppConfig } from "@/config.js";

/**
 * Logger options per environment:
 * - development: pretty-printed, verbose
 * - production:  structured JSON at info level (ship as-is to your log stack;
 *                see docs/recipes.md for a GCP severity mapping)
 * - test:        silent, so test output stays readable
 */
export const loggerFor = (
    env: AppConfig["NODE_ENV"],
): FastifyServerOptions["logger"] => {
    switch (env) {
        case "development":
            return {
                level: "debug",
                transport: { target: "pino-pretty" },
            };
        case "production":
            return { level: "info" };
        case "test":
            return false;
    }
};
