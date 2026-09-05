import { EmailTakenError, UserNotFoundError } from "./user.errors.js";
import type { User } from "./user.entity.js";
import type { UserRepository } from "./user.ports.js";
import type { PrismaClient, User as UserRow } from "@/generated/prisma/client.js";

const toUser = (row: UserRow): User => ({
    id: row.id,
    email: row.email,
    name: row.name,
    avatarKey: row.avatarKey,
    onboardedAt: row.onboardedAt,
    createdAt: row.createdAt,
});

export const createPrismaUserRepository = (
    prisma: PrismaClient,
): UserRepository => ({
    create: async (data) => {
        const row = await prisma.user
            .create({
                data: { email: data.email, name: data.name },
            })
            .catch((error: unknown) => {
                if (isPrismaError(error, "P2002")) {
                    throw new EmailTakenError();
                }

                throw error;
            });

        return toUser(row);
    },

    findById: async (id) => {
        const row = await prisma.user.findUnique({ where: { id } });

        return row === null ? null : toUser(row);
    },

    save: async (user) => {
        const row = await prisma.user
            .update({
                where: { id: user.id },
                data: {
                    email: user.email,
                    name: user.name,
                    avatarKey: user.avatarKey,
                    onboardedAt: user.onboardedAt,
                },
            })
            .catch((error: unknown) => {
                if (isPrismaError(error, "P2025")) {
                    throw new UserNotFoundError();
                }

                throw error;
            });

        return toUser(row);
    },
});

const isPrismaError = (error: unknown, code: string): boolean => {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === code
    );
};
