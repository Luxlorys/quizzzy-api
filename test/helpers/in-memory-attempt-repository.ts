import { AttemptNotFoundError } from "@/modules/quiz/quiz.errors.js";
import type { Attempt, AttemptSummary } from "@/modules/quiz/quiz.entity.js";
import type { AttemptRepository } from "@/modules/quiz/quiz.ports.js";

const toSummary = (attempt: Attempt): AttemptSummary => ({
    id: attempt.id,
    quizId: attempt.quizId,
    status: attempt.status,
    currentIndex: attempt.currentIndex,
    score: attempt.score,
    total: attempt.total,
    submittedAt: attempt.submittedAt,
});

/**
 * A genuine implementation of the AttemptRepository port, not a mock: it
 * honors the same contract as the Prisma implementation — auto-incrementing
 * ids, a save that replaces the whole answer set, and one latest attempt per
 * quiz (highest id wins).
 */
export const createInMemoryAttemptRepository = (): AttemptRepository & {
    rows: () => Attempt[];
} => {
    let nextId = 1;
    let rows: Attempt[] = [];

    return {
        rows: () => [...rows],

        create: async (data) => {
            const attempt: Attempt = {
                id: nextId++,
                quizId: data.quizId,
                status: "draft",
                currentIndex: data.currentIndex,
                answers: [...data.answers],
                score: null,
                total: null,
                startedAt: data.startedAt,
                submittedAt: null,
            };

            rows = [...rows, attempt];

            return attempt;
        },

        findById: async (id) => rows.find((attempt) => attempt.id === id) ?? null,

        save: async (attempt) => {
            if (!rows.some((row) => row.id === attempt.id)) {
                throw new AttemptNotFoundError();
            }

            rows = rows.map((row) => (row.id === attempt.id ? attempt : row));

            return attempt;
        },

        findLatestForQuizzes: async (quizIds) => {
            const latest = new Map<number, Attempt>();

            for (const attempt of [...rows].sort((a, b) => a.id - b.id)) {
                if (quizIds.includes(attempt.quizId)) {
                    latest.set(attempt.quizId, attempt);
                }
            }

            return [...latest.values()].map(toSummary);
        },
    };
};
