import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createUser } from "./factories/user.factory.js";
import type { FastifyInstance } from "fastify";

describe("user routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    it("creates a user and returns 201 with the wire shape", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { email: "andrei@example.com", name: "Andrei" },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            email: "andrei@example.com",
            name: "Andrei",
            onboardedAt: null,
        });
    });

    it("maps a duplicate email to 409 via the adapter's error translation", async () => {
        const existing = await createUser({ prisma: app.prisma });

        const response = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { email: existing.email, name: "Impostor" },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            message: "A user with this email already exists.",
        });
    });

    it("rejects a malformed email with 400", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { email: "not-an-email", name: "Andrei" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("returns 404 for an unknown user", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/api/users/999999",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: "User not found." });
    });

    describe("PUT /api/users/:id/avatar", () => {
        it("uploads to object storage and persists the key on the user", async () => {
            const user = await createUser({ prisma: app.prisma });

            const response = await app.inject({
                method: "PUT",
                url: `/api/users/${user.id}/avatar`,
                headers: { "content-type": "image/png" },
                payload: Buffer.from("fake-png-bytes"),
            });

            expect(response.statusCode).toBe(200);

            const { avatarKey } = response.json<{ avatarKey: string }>();

            expect(avatarKey).toMatch(new RegExp(`^avatars/${user.id}/`));

            const readBack = await app.inject({
                method: "GET",
                url: `/api/users/${user.id}`,
            });

            expect(readBack.json()).toMatchObject({ avatarKey });
        });

        it("rejects a content type nothing can parse with 415", async () => {
            const user = await createUser({ prisma: app.prisma });

            const response = await app.inject({
                method: "PUT",
                url: `/api/users/${user.id}/avatar`,
                headers: { "content-type": "application/pdf" },
                payload: Buffer.from("%PDF-fake"),
            });

            expect(response.statusCode).toBe(415);
            expect(response.json()).toHaveProperty("message");
        });

        it("rejects a parseable but disallowed content type with 400", async () => {
            const user = await createUser({ prisma: app.prisma });

            // text/plain has a built-in Fastify parser, so the request parses
            // and the headers schema rejects it like any other invalid input.
            const response = await app.inject({
                method: "PUT",
                url: `/api/users/${user.id}/avatar`,
                headers: { "content-type": "text/plain" },
                payload: "not an image",
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toHaveProperty("message");
        });

        it("maps an empty body to the module's 422 rule", async () => {
            const user = await createUser({ prisma: app.prisma });

            const response = await app.inject({
                method: "PUT",
                url: `/api/users/${user.id}/avatar`,
                headers: { "content-type": "image/png" },
                payload: Buffer.alloc(0),
            });

            expect(response.statusCode).toBe(422);
            expect(response.json()).toEqual({
                message: "The avatar upload contains no data.",
            });
        });

        it("returns 404 for an unknown user", async () => {
            const response = await app.inject({
                method: "PUT",
                url: "/api/users/999999/avatar",
                headers: { "content-type": "image/png" },
                payload: Buffer.from("fake-png-bytes"),
            });

            expect(response.statusCode).toBe(404);
        });
    });
});
