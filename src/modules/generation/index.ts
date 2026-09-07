import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import { createAnthropicQuizGenerator } from "./generation.anthropic.service.js";
import { createRedisGenerationLock } from "./generation.cache.repository.js";
import { createPrismaGenerationRepository } from "./generation.prisma.repository.js";
import { createGenerationService } from "./generation.service.js";
import { generationRoutes } from "./generation.routes.js";
import { systemClock } from "@/lib/clock.js";
import type { QuizGenerator } from "./ports/generator.port.js";
import type { FastifyInstance } from "fastify";

export type GenerationModuleOptions = {
    generator?: QuizGenerator;
};

const generationModule = async (
    fastify: FastifyInstance,
    opts: GenerationModuleOptions = {},
) => {
    const repository = createPrismaGenerationRepository(fastify.prisma);

    const lock = createRedisGenerationLock(
        fastify.redis,
        fastify.config.GENERATION_LOCK_TTL_SECONDS,
    );

    const generator =
        opts.generator ??
        createAnthropicQuizGenerator(fastify.anthropic, {
            model: fastify.config.ANTHROPIC_MODEL,
            effort: fastify.config.GENERATION_EFFORT,
            maxOutputTokens: fastify.config.GENERATION_MAX_OUTPUT_TOKENS,
            maxInputTokens: fastify.config.GENERATION_MAX_INPUT_TOKENS,
        });

    const service = createGenerationService(
        {
            repository,
            lock,
            generator,
            articles: fastify.articleService,
            quizzes: fastify.quizService,
            clock: systemClock,
            tokens: { generate: () => randomUUID() },
        },
        {
            lockRenewSeconds: fastify.config.GENERATION_LOCK_RENEW_SECONDS,
            questionBounds: {
                min: fastify.config.GENERATION_MIN_QUESTIONS,
                max: fastify.config.GENERATION_MAX_QUESTIONS,
            },
            maxCorrections: fastify.config.GENERATION_MAX_CORRECTIONS,
        },
    );

    fastify.decorate("generationService", service);

    try {
        await service.reconcileOnBoot();
    } catch (error) {
        fastify.log.warn(
            { err: error },
            "generation boot sweep failed; an orphaned lock will still self-heal via its TTL",
        );
    }

    await fastify.register(generationRoutes(service), {
        prefix: "/api/generations",
    });
};

export default fp(generationModule, { name: "generation-module" });
