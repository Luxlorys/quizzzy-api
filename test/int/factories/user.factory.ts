import { randomUUID } from "node:crypto";
import type {
    Prisma,
    PrismaClient,
    User as UserRow,
} from "@/generated/prisma/client.js";

type CreateUserArgs = {
    prisma: PrismaClient;
    overrides?: Partial<Prisma.UserUncheckedCreateInput>;
};

export const createUser = async ({
    prisma,
    overrides = {},
}: CreateUserArgs): Promise<UserRow> => {
    return prisma.user.create({
        data: {
            email: `user-${randomUUID()}@example.com`,
            name: "Test User",
            ...overrides,
        },
    });
};
