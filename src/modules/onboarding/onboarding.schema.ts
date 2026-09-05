import { z } from "zod";

export const completeOnboardingBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
});

export const onboardingResultResponseSchema = z.object({
    userId: z.number().int(),
    welcomeTaskId: z.number().int(),
});
