import { GenerationNotFoundError } from "@/modules/generation/generation.errors.js";
import type { Generation } from "@/modules/generation/generation.entity.js";
import type { GenerationRepository } from "@/modules/generation/ports/repository.port.js";

const isActive = (generation: Generation): boolean =>
    generation.status === "pending" || generation.status === "running";

export const createInMemoryGenerationRepository = (): GenerationRepository & {
    rows: () => Generation[];
} => {
    let nextId = 1;
    let rows: Generation[] = [];

    return {
        rows: () => [...rows],

        create: async (data) => {
            const now = new Date();

            const generation: Generation = {
                id: nextId++,
                articleId: data.articleId,
                status: "pending",
                lockToken: data.lockToken,
                quizId: null,
                failureCode: null,
                failureMessage: null,
                inputTokens: null,
                outputTokens: null,
                cacheReadTokens: null,
                createdAt: now,
                updatedAt: now,
                finishedAt: null,
            };

            rows = [...rows, generation];

            return generation;
        },

        findById: async (id) =>
            rows.find((generation) => generation.id === id) ?? null,

        findActive: async () => rows.find(isActive) ?? null,

        save: async (generation) => {
            if (!rows.some((row) => row.id === generation.id)) {
                throw new GenerationNotFoundError();
            }

            const updated = { ...generation, updatedAt: new Date() };

            rows = rows.map((row) => (row.id === generation.id ? updated : row));

            return updated;
        },

        failUnfinished: async (now, exceptLockToken) => {
            const failed = rows
                .filter(isActive)
                .filter((row) => row.lockToken !== exceptLockToken)
                .map((row): Generation => ({
                    ...row,
                    status: "failed",
                    failureCode: "LOCK_LOST",
                    failureMessage: "That generation was interrupted. Try again.",
                    finishedAt: now,
                    updatedAt: now,
                }));

            rows = rows.map(
                (row) => failed.find((updated) => updated.id === row.id) ?? row,
            );

            return failed;
        },
    };
};
