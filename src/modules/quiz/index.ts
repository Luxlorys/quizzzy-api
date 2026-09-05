import { createRedisQuizCache } from "./quiz.cache.repository.js";
import {
    createPrismaAttemptRepository,
    createPrismaQuizRepository,
} from "./quiz.prisma.repository.js";
import { createQuizService } from "./quiz.service.js";
import { attemptRoutes, quizRoutes } from "./quiz.routes.js";
import { systemClock } from "@/lib/clock.js";
import type { FastifyPluginAsync } from "fastify";

export const quizModule: FastifyPluginAsync = async (fastify) => {
    const repository = createPrismaQuizRepository(fastify.prisma);
    const attempts = createPrismaAttemptRepository(fastify.prisma);

    const cache = createRedisQuizCache(
        fastify.redis,
        fastify.config.CACHE_TTL_SECONDS,
    );

    const service = createQuizService({
        repository,
        attempts,
        cache,
        articles: fastify.articleService,
        clock: systemClock,
    });

    await fastify.register(quizRoutes(service), { prefix: "/api/quizzes" });
    await fastify.register(attemptRoutes(service), { prefix: "/api/attempts" });
};
