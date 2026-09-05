import { createOnboardingService } from "./onboarding.service.js";
import { onboardingRoutes } from "./onboarding.routes.js";
import type { FastifyPluginAsync } from "fastify";

export const onboardingModule: FastifyPluginAsync = async (fastify) => {
    const service = createOnboardingService({
        users: fastify.userService,
        tasks: fastify.taskService,
    });

    await fastify.register(onboardingRoutes(service));
};
