import type { TaskPublicApi } from "@/modules/task/task.ports.js";
import type { UserPublicApi } from "@/modules/user/user.ports.js";

export type OnboardingResultDto = {
    userId: number;
    welcomeTaskId: number;
};

export type OnboardingService = {
    completeOnboarding: (userId: number) => Promise<OnboardingResultDto>;
};

export type OnboardingServiceDeps = {
    users: UserPublicApi;
    tasks: TaskPublicApi;
};
