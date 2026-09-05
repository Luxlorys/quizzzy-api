import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * The unit lane needs nothing: no database, no Docker, no env files. If a
 * test can't run here, it belongs in test/int.
 */
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ["test/unit/**/*.test.ts"],
        environment: "node",
    },
});
