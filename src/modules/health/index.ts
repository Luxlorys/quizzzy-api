import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const healthResponseSchema = z.object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
});

export const healthModule: FastifyPluginAsyncZod = async (fastify) => {
    fastify.get(
        "/",
        {
            schema: {
                tags: ["health"],
                summary: "Liveness and database connectivity",
                response: {
                    200: healthResponseSchema,
                    503: healthResponseSchema,
                },
            },
        },
        async (_request, reply) => {
            try {
                await fastify.prisma.$queryRaw`SELECT 1`;
            } catch (error) {
                fastify.log.error(
                    { err: error },
                    "health check: database unreachable",
                );

                return reply
                    .code(503)
                    .send({ status: "degraded", database: "down" } as const);
            }

            return { status: "ok", database: "up" } as const;
        },
    );
};
