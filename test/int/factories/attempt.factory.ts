import type {
    Attempt as AttemptRow,
    Prisma,
    PrismaClient,
} from "@/generated/prisma/client.js";

/**
 * Seeds an attempt against an existing quiz. The quiz id must be read off a
 * quiz factory's return — TRUNCATE restarts identity sequences between tests.
 */
type CreateAttemptArgs = {
    prisma: PrismaClient;
    quizId: number;
    overrides?: Partial<Prisma.AttemptUncheckedCreateInput>;
};

export const createAttempt = async ({
    prisma,
    quizId,
    overrides = {},
}: CreateAttemptArgs): Promise<AttemptRow> => {
    return prisma.attempt.create({
        data: {
            quizId,
            startedAt: new Date("2026-03-01T10:00:00.000Z"),
            ...overrides,
        },
    });
};
