import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config.js";

/** The variables with no default — every test needs at least these. */
const REQUIRED = {
    DATABASE_URL: "postgresql://localhost:5432/app",
    REDIS_URL: "redis://localhost:6379",
    ANTHROPIC_API_KEY: "test-key",
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
        expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(
            /ANTHROPIC_API_KEY/,
        );
        expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/PORT/);
    });

    it("refuses to boot without an Anthropic API key", () => {
        expect(() =>
            loadConfig({
                DATABASE_URL: REQUIRED.DATABASE_URL,
                REDIS_URL: REQUIRED.REDIS_URL,
            }),
        ).toThrow(/ANTHROPIC_API_KEY/);
    });

    it("rejects a lock renewal interval more than half the lock TTL", () => {
        expect(() =>
            loadConfig({
                ...REQUIRED,
                GENERATION_LOCK_TTL_SECONDS: "90",
                GENERATION_LOCK_RENEW_SECONDS: "50",
            }),
        ).toThrow(/GENERATION_LOCK_RENEW_SECONDS/);
    });

    it("accepts a lock renewal interval at exactly half the lock TTL", () => {
        const config = loadConfig({
            ...REQUIRED,
            GENERATION_LOCK_TTL_SECONDS: "90",
            GENERATION_LOCK_RENEW_SECONDS: "45",
        });

        expect(config.GENERATION_LOCK_RENEW_SECONDS).toBe(45);
    });
});
