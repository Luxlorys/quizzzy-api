import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createUser } from "./factories/user.factory.js";
import type { FastifyInstance } from "fastify";

/**
 * The cross-module wiring, proven end to end over HTTP: the onboarding
 * module drives the user module and the task module through the decorations,
 * importing only the two published API types.
 */
describe("POST /api/onboarding/complete", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    it("journey: onboards the user, creates the welcome task, rejects a repeat", async () => {
        const user = await createUser({
            prisma: app.prisma,
            overrides: { name: "Andrei" },
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/onboarding/complete",
            body: { userId: user.id },
        });

        expect(response.statusCode).toBe(200);

        const { userId, welcomeTaskId } = response.json<{
            userId: number;
            welcomeTaskId: number;
        }>();

        expect(userId).toBe(user.id);

        const onboardedUser = await app.inject({
            method: "GET",
            url: `/api/users/${user.id}`,
        });

        expect(onboardedUser.json()).toMatchObject({
            onboardedAt: expect.any(String) as string,
        });

        const welcomeTask = await app.inject({
            method: "GET",
            url: `/api/tasks/${welcomeTaskId}`,
        });

        expect(welcomeTask.statusCode).toBe(200);
        expect(welcomeTask.json()).toMatchObject({
            title: "Welcome aboard, Andrei — create your first task",
            status: "open",
        });

        const repeat = await app.inject({
            method: "POST",
            url: "/api/onboarding/complete",
            body: { userId: user.id },
        });

        expect(repeat.statusCode).toBe(409);
        expect(repeat.json()).toEqual({
            message: "User has already completed onboarding.",
        });
    });

    it("maps an unknown user to 404 from the user module's error", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/onboarding/complete",
            body: { userId: 999999 },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: "User not found." });
    });
});
