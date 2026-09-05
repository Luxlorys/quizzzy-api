import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import type { FastifyInstance } from "fastify";

describe("application plumbing", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    it("reports health with database connectivity", async () => {
        const response = await app.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "ok", database: "up" });
    });

    it("applies security headers and rate-limit accounting", async () => {
        const response = await app.inject({ method: "GET", url: "/health" });

        expect(response.headers).toHaveProperty("x-content-type-options");
        expect(response.headers).toHaveProperty("x-ratelimit-limit");
    });

    it("returns the uniform error body for unknown routes", async () => {
        const response = await app.inject({ method: "GET", url: "/nope" });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: "Route not found." });
    });

    it("serves the OpenAPI spec generated from the Zod schemas", async () => {
        const response = await app.inject({ method: "GET", url: "/docs/json" });

        expect(response.statusCode).toBe(200);

        const spec = response.json<{
            openapi: string;
            paths: Record<string, unknown>;
        }>();

        expect(spec.openapi).toMatch(/^3\./);
        expect(Object.keys(spec.paths)).toContain("/api/tasks/");
    });

    it("locks the docs behind basic auth when DOCS_PASSWORD is set", async () => {
        const guarded = await buildTestApp({ DOCS_PASSWORD: "secret" });

        try {
            const anonymous = await guarded.inject({
                method: "GET",
                url: "/docs/json",
            });

            expect(anonymous.statusCode).toBe(401);

            const authorized = await guarded.inject({
                method: "GET",
                url: "/docs/json",
                headers: {
                    authorization: `Basic ${Buffer.from("docs:secret").toString("base64")}`,
                },
            });

            expect(authorized.statusCode).toBe(200);
        } finally {
            await guarded.close();
        }
    });
});
