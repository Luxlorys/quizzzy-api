import {
    generationParamsSchema,
    generationResponseSchema,
    startGenerationBodySchema,
} from "./generation.schema.js";
import {
    toGenerationResponse,
    toStartGenerationInput,
} from "./dto/generation.dto.js";
import { errorResponseSchema } from "@/lib/schemas.js";
import type { GenerationService } from "./ports/service.port.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const GENERATION_TAG = "generations";

export const generationRoutes =
    (service: GenerationService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [GENERATION_TAG],
                    summary: "Start generating a quiz from an article",
                    body: startGenerationBodySchema,
                    response: {
                        202: generationResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                        503: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const generation = await service.startGeneration(
                    toStartGenerationInput(request.body),
                );

                return reply.code(202).send(toGenerationResponse(generation));
            },
        );

        fastify.get(
            "/active",
            {
                schema: {
                    tags: [GENERATION_TAG],
                    summary: "Get the currently running generation, if any",
                    response: {
                        200: generationResponseSchema.nullable(),
                    },
                },
            },
            async () => {
                const active = await service.getActiveGeneration();

                return active === null ? null : toGenerationResponse(active);
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [GENERATION_TAG],
                    summary: "Get a generation's status",
                    params: generationParamsSchema,
                    response: {
                        200: generationResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const generation = await service.getGeneration(request.params.id);

                return toGenerationResponse(generation);
            },
        );
    };
