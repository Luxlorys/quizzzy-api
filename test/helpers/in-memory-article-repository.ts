import { systemClock } from "@/lib/clock.js";
import { ArticleNotFoundError } from "@/modules/article/article.errors.js";
import type { Clock } from "@/lib/clock.js";
import type { Article } from "@/modules/article/article.entity.js";
import type { ArticleRepository } from "@/modules/article/article.ports.js";

/**
 * A genuine implementation of the ArticleRepository port, not a mock: it
 * honors the same contract as the Prisma implementation — auto-incrementing
 * ids, and a delete of a row that is not there raising ArticleNotFoundError.
 */
export const createInMemoryArticleRepository = (
    clock: Clock = systemClock,
): ArticleRepository & { rows: () => Article[] } => {
    let nextId = 1;
    let rows: Article[] = [];

    return {
        rows: () => [...rows],

        create: async (data) => {
            const article: Article = {
                id: nextId++,
                filename: data.filename,
                sourceKey: data.sourceKey,
                createdAt: clock.now(),
            };

            rows = [...rows, article];

            return article;
        },

        findById: async (id) => rows.find((article) => article.id === id) ?? null,

        remove: async (id) => {
            if (!rows.some((article) => article.id === id)) {
                throw new ArticleNotFoundError();
            }

            rows = rows.filter((article) => article.id !== id);
        },
    };
};
