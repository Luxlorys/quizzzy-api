import { systemClock } from "@/lib/clock.js";
import { EmailTakenError } from "@/modules/user/user.errors.js";
import type { Clock } from "@/lib/clock.js";
import type { User } from "@/modules/user/user.entity.js";
import type { UserRepository } from "@/modules/user/user.ports.js";

/**
 * Genuine implementation of the UserRepository port. It honors the same
 * contract the Prisma implementation honors — including rejecting duplicate emails
 * with EmailTakenError, mirroring the unique constraint.
 */
export const createInMemoryUserRepository = (
    clock: Clock = systemClock,
): UserRepository & { rows: () => User[] } => {
    let nextId = 1;
    let rows: User[] = [];

    return {
        rows: () => [...rows],

        create: async (data) => {
            if (rows.some((user) => user.email === data.email)) {
                throw new EmailTakenError();
            }

            const user: User = {
                id: nextId++,
                email: data.email,
                name: data.name,
                avatarKey: null,
                onboardedAt: null,
                createdAt: clock.now(),
            };

            rows = [...rows, user];

            return user;
        },

        findById: async (id) => rows.find((user) => user.id === id) ?? null,

        save: async (user) => {
            rows = rows.map((row) => (row.id === user.id ? user : row));

            return user;
        },
    };
};
