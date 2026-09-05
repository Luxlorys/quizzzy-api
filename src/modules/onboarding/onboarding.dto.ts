import type { OnboardingResultDto } from "./onboarding.ports.js";

export const toOnboardingResultResponse = (dto: OnboardingResultDto) => ({
    userId: dto.userId,
    welcomeTaskId: dto.welcomeTaskId,
});
