import { GENERATION_STATUSES } from "./generation.entity.js";
import type { Generation } from "./generation.entity.js";
import type { GenerationRepository } from "./ports/repository.port.js";
import type {
    Prisma,
    QuizGeneration as GenerationRow,
    PrismaClient,
} from "@/generated/prisma/client.js";

const ACTIVE_STATUSES = GENERATION_STATUSES.filter(
    (status) => status === "pending" || status === "running",
);

const LOCK_LOST_FAILURE_CODE = "LOCK_LOST";
const LOCK_LOST_FAILURE_MESSAGE = "That generation was interrupted. Try again.";

const toGeneration = (row: GenerationRow): Generation => ({
    id: row.id,
    articleId: row.articleId,
    status: row.status,
    lockToken: row.lockToken,
    quizId: row.quizId,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
});

export const createPrismaGenerationRepository = (
    prisma: PrismaClient,
): GenerationRepository => ({
    create: async (data) => {
        const row = await prisma.quizGeneration.create({
            data: {
                articleId: data.articleId,
                lockToken: data.lockToken,
            },
        });

        return toGeneration(row);
    },

    findById: async (id) => {
        const row = await prisma.quizGeneration.findUnique({ where: { id } });

        return row === null ? null : toGeneration(row);
    },

    findActive: async () => {
        const row = await prisma.quizGeneration.findFirst({
            where: { status: { in: [...ACTIVE_STATUSES] } },
            orderBy: { createdAt: "desc" },
        });

        return row === null ? null : toGeneration(row);
    },

    save: async (generation) => {
        const row = await prisma.quizGeneration.update({
            where: { id: generation.id },
            data: {
                status: generation.status,
                quizId: generation.quizId,
                failureCode: generation.failureCode,
                failureMessage: generation.failureMessage,
                inputTokens: generation.inputTokens,
                outputTokens: generation.outputTokens,
                cacheReadTokens: generation.cacheReadTokens,
                finishedAt: generation.finishedAt,
            },
        });

        return toGeneration(row);
    },

    failUnfinished: async (now, exceptLockToken) => {
        const where: Prisma.QuizGenerationWhereInput = {
            status: { in: [...ACTIVE_STATUSES] },
            ...(exceptLockToken !== null && { lockToken: { not: exceptLockToken } }),
        };

        const rows = await prisma.quizGeneration.updateManyAndReturn({
            where,
            data: {
                status: "failed",
                failureCode: LOCK_LOST_FAILURE_CODE,
                failureMessage: LOCK_LOST_FAILURE_MESSAGE,
                finishedAt: now,
            },
        });

        return rows.map(toGeneration);
    },
});
