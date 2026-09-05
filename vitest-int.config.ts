import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { INT_TEST_WORKERS } from "./test/int/setup/workers.js";

/**
 * The integration lane boots one throwaway Postgres (Testcontainers), clones
 * one database per worker, and truncates between tests — see test/int/setup.
 * The only prerequisite is a running Docker daemon.
 */
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ["test/int/**/*.test.ts"],
        environment: "node",
        globalSetup: ["test/int/setup/global.ts"],
        setupFiles: [
            "test/int/setup/env.ts",
            "test/int/setup/reset-db.ts",
            "test/int/setup/reset-redis.ts",
        ],
        // app.ts loads src/plugins/ through @fastify/autoload, which import()s
        // each file at runtime. Externalized dependencies run their imports in
        // plain Node, which cannot read .ts — inlining autoload puts that
        // import() back through Vite's transform.
        server: { deps: { inline: ["@fastify/autoload"] } },
        maxWorkers: INT_TEST_WORKERS,
        hookTimeout: 120_000,
        testTimeout: 30_000,
    },
});
