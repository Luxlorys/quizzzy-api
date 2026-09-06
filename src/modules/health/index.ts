import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const healthResponseSchema = z.object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
    cache: z.enum(["up", "down"]),
});

export const healthModule: FastifyPluginAsyncZod = async (fastify) => {
    fastify.get(
        "/",
        {
            schema: {
                tags: ["health"],
                summary: "Liveness, database, and cache/lock-store connectivity",
                response: {
                    200: healthResponseSchema,
                    503: healthResponseSchema,
                },
            },
        },
        async (_request, reply) => {
            const [database, cache] = await Promise.all([
                fastify.prisma.$queryRaw`SELECT 1`
                    .then(() => "up" as const)
                    .catch((error: unknown) => {
                        fastify.log.error(
                            { err: error },
                            "health check: database unreachable",
                        );

                        return "down" as const;
                    }),
                fastify.redis
                    .ping()
                    .then(() => "up" as const)
                    .catch((error: unknown) => {
                        fastify.log.error(
                            { err: error },
                            "health check: cache unreachable",
                        );

                        return "down" as const;
                    }),
            ]);

            const status = database === "up" && cache === "up" ? "ok" : "degraded";

            return reply
                .code(status === "ok" ? 200 : 503)
                .send({ status, database, cache });
        },
    );
};
