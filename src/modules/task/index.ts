import fp from "fastify-plugin";
import { createRedisTaskCache } from "./task.cache.repository.js";
import { createPrismaTaskRepository } from "./task.prisma.repository.js";
import { createTaskService } from "./task.service.js";
import { taskRoutes } from "./task.routes.js";
import { systemClock } from "@/lib/clock.js";
import type { FastifyInstance } from "fastify";

const taskModule = async (fastify: FastifyInstance) => {
    const repository = createPrismaTaskRepository(fastify.prisma);

    const cache = createRedisTaskCache(
        fastify.redis,
        fastify.config.CACHE_TTL_SECONDS,
    );

    const service = createTaskService({ repository, cache, clock: systemClock });

    fastify.decorate("taskService", service);

    await fastify.register(taskRoutes(service), { prefix: "/api/tasks" });
};

export default fp(taskModule, { name: "task-module" });
