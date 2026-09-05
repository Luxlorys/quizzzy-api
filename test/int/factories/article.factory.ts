import { randomUUID } from "node:crypto";
import type {
    Article as ArticleRow,
    Prisma,
    PrismaClient,
} from "@/generated/prisma/client.js";

/**
 * Arrange factory: seeds a precondition directly through Prisma so a test can
 * start from a known state without depending on another test having run.
 *
 * Never accepts or assumes an `id`. The per-test TRUNCATE restarts identity
 * sequences, so a hardcoded id is only ever accidentally correct — read the
 * id back off the returned row instead.
 */
type CreateArticleArgs = {
    prisma: PrismaClient;
    overrides?: Partial<Prisma.ArticleUncheckedCreateInput>;
};

export const createArticle = async ({
    prisma,
    overrides = {},
}: CreateArticleArgs): Promise<ArticleRow> => {
    const filename = `article-${randomUUID()}.html`;

    return prisma.article.create({
        data: {
            filename,
            sourceKey: `${randomUUID()}-${filename}`,
            ...overrides,
        },
    });
};
