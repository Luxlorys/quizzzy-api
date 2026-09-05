import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config.js";

/** The variables with no default — every test needs at least these. */
const REQUIRED = {
    DATABASE_URL: "postgresql://localhost:5432/app",
    REDIS_URL: "redis://localhost:6379",
};

describe("loadConfig", () => {
    it("applies defaults over a minimal environment", () => {
        const config = loadConfig(REQUIRED);

        expect(config).toMatchObject({
            NODE_ENV: "development",
            HOST: "0.0.0.0",
            PORT: 3000,
            RATE_LIMIT_MAX: 100,
            CACHE_TTL_SECONDS: 60,
        });
    });

    it("coerces numeric variables from strings", () => {
        const config = loadConfig({
            ...REQUIRED,
            PORT: "8080",
            CACHE_TTL_SECONDS: "300",
        });

        expect(config.PORT).toBe(8080);
        expect(config.CACHE_TTL_SECONDS).toBe(300);
    });

    it("names every offending variable when validation fails", () => {
        expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/DATABASE_URL/);
        expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/REDIS_URL/);
        expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/PORT/);
    });
});
