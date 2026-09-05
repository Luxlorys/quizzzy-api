import fp from "fastify-plugin";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client.js";
import type { FastifyInstance } from "fastify";

/**
 * Owns the PrismaClient lifecycle: create, connect, decorate, disconnect.
 * The only other place Prisma may appear is a module's *.prisma.repository.ts
 * adapter — enforced by dependency-cruiser.
 */
const database = async (fastify: FastifyInstance) => {
    const adapter = new PrismaPg({
        connectionString: fastify.config.DATABASE_URL,
    });

    const prisma = new PrismaClient({ adapter });

    await prisma.$connect();

    fastify.decorate("prisma", prisma);

    fastify.addHook("onClose", async (instance) => {
        await instance.prisma.$disconnect();
    });
};

export default fp(database, { name: "database" });
