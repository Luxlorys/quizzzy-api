import { describe, expect, it } from "vitest";
import { createOnboardingService } from "@/modules/onboarding/onboarding.service.js";
import { UserAlreadyOnboardedError } from "@/modules/user/user.errors.js";
import type { TaskPublicApi } from "@/modules/task/task.ports.js";
import type { UserPublicApi } from "@/modules/user/user.ports.js";

/**
 * The narrow-contract payoff in test form: the "user module" and "task module"
 * here are a few lines each, because the service depends on two published
 * APIs — not on the real services, not on Fastify decorations, not on
 * mocks. Because these are the same types the modules publish, a published-API
 * change breaks this file too, which is the point.
 */
describe("completeOnboarding", () => {
    it("marks the user onboarded, then creates a personalized welcome task", async () => {
        const calls: string[] = [];

        const users: UserPublicApi = {
            markOnboarded: async (userId) => {
                calls.push(`onboard:${userId}`);

                return { id: userId, name: "Andrei" };
            },
        };

        const tasks: TaskPublicApi = {
            createTask: async ({ title }) => {
                calls.push(`task:${title}`);

                return { id: 77 };
            },
        };

        const service = createOnboardingService({ users, tasks });

        const result = await service.completeOnboarding(5);

        expect(result).toEqual({ userId: 5, welcomeTaskId: 77 });
        expect(calls).toEqual([
            "onboard:5",
            "task:Welcome aboard, Andrei — create your first task",
        ]);
    });

    it("propagates the user module's rule and creates no task", async () => {
        let taskCreated = false;

        const users: UserPublicApi = {
            markOnboarded: async () => {
                throw new UserAlreadyOnboardedError();
            },
        };

        const tasks: TaskPublicApi = {
            createTask: async () => {
                taskCreated = true;

                return { id: 1 };
            },
        };

        const service = createOnboardingService({ users, tasks });

        await expect(service.completeOnboarding(5)).rejects.toBeInstanceOf(
            UserAlreadyOnboardedError,
        );
        expect(taskCreated).toBe(false);
    });
});
