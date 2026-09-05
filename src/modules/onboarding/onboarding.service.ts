import type {
    OnboardingService,
    OnboardingServiceDeps,
} from "./onboarding.ports.js";

export const createOnboardingService = ({
    users,
    tasks,
}: OnboardingServiceDeps): OnboardingService => ({
    completeOnboarding: async (userId) => {
        const user = await users.markOnboarded(userId);

        const task = await tasks.createTask({
            title: `Welcome aboard, ${user.name} — create your first task`,
        });

        return { userId: user.id, welcomeTaskId: task.id };
    },
});
