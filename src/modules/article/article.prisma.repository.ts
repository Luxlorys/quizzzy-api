import { ArticleNotFoundError } from "./article.errors.js";
import type { Article } from "./article.entity.js";
import type { ArticleRepository } from "./article.ports.js";
import type {
    Article as ArticleRow,
    PrismaClient,
} from "@/generated/prisma/client.js";

const toArticle = (row: ArticleRow): Article => ({
    id: row.id,
    filename: row.filename,
    sourceKey: row.sourceKey,
    createdAt: row.createdAt,
});

const isRecordNotFound = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025";

export const createPrismaArticleRepository = (
    prisma: PrismaClient,
): ArticleRepository => ({
    create: async (data) => {
        const row = await prisma.article.create({
            data: {
                filename: data.filename,
                sourceKey: data.sourceKey,
            },
        });

        return toArticle(row);
    },

    findById: async (id) => {
        const row = await prisma.article.findUnique({ where: { id } });

        return row === null ? null : toArticle(row);
    },

    remove: async (id) => {
        await prisma.article.delete({ where: { id } }).catch((error: unknown) => {
            if (isRecordNotFound(error)) {
                throw new ArticleNotFoundError();
            }

            throw error;
        });
    },
});
