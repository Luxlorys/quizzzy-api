import fp from "fastify-plugin";
import { createPrismaUserRepository } from "./user.prisma.repository.js";
import { createS3AvatarRepository } from "./user.s3.repository.js";
import { createUserService } from "./user.service.js";
import { userRoutes } from "./user.routes.js";
import { systemClock } from "@/lib/clock.js";
import type { FastifyInstance } from "fastify";

const userModule = async (fastify: FastifyInstance) => {
    const repository = createPrismaUserRepository(fastify.prisma);

    const avatars = createS3AvatarRepository(
        fastify.s3,
        fastify.config.S3_AVATARS_BUCKET,
    );

    const service = createUserService({ repository, avatars, clock: systemClock });

    fastify.decorate("userService", service);

    await fastify.register(userRoutes(service), { prefix: "/api/users" });
};

export default fp(userModule, { name: "user-module" });
