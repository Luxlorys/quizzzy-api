import {
    completeOnboardingBodySchema,
    onboardingResultResponseSchema,
} from "./onboarding.schema.js";
import { toOnboardingResultResponse } from "./onboarding.dto.js";
import { errorResponseSchema } from "@/lib/schemas.js";
import type { OnboardingService } from "./onboarding.ports.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const ONBOARDING_TAG = "onboarding";

export const onboardingRoutes =
    (service: OnboardingService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/complete",
            {
                schema: {
                    tags: [ONBOARDING_TAG],
                    summary:
                        "Complete a user's onboarding (marks the user, creates a welcome task)",
                    body: completeOnboardingBodySchema,
                    response: {
                        200: onboardingResultResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const result = await service.completeOnboarding(request.body.userId);

                return toOnboardingResultResponse(result);
            },
        );
    };
