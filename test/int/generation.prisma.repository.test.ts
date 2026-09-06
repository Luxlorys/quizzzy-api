import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArticle } from "./factories/article.factory.js";
import { createQuiz } from "./factories/quiz.factory.js";
import { PrismaClient } from "@/generated/prisma/client.js";
import { createPrismaGenerationRepository } from "@/modules/generation/generation.prisma.repository.js";

describe("Prisma generation repository", () => {
    let prisma: PrismaClient;
    let generations: ReturnType<typeof createPrismaGenerationRepository>;

    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        });

        await prisma.$connect();

        generations = createPrismaGenerationRepository(prisma);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("creates a pending generation for an article", async () => {
        const article = await createArticle({ prisma });

        const created = await generations.create({
            articleId: article.id,
            lockToken: "token-1",
        });

        expect(created).toMatchObject({
            articleId: article.id,
            status: "pending",
            lockToken: "token-1",
            quizId: null,
            failureCode: null,
        });

        await expect(generations.findById(created.id)).resolves.toEqual(created);
    });

    it("finds the active pending or running generation, and null when there is none", async () => {
        const article = await createArticle({ prisma });

        await expect(generations.findActive()).resolves.toBeNull();

        const created = await generations.create({
            articleId: article.id,
            lockToken: "token-2",
        });

        await expect(generations.findActive()).resolves.toEqual(created);

        await generations.save({
            ...created,
            status: "succeeded",
            finishedAt: new Date(),
        });

        await expect(generations.findActive()).resolves.toBeNull();
    });

    it("saves the terminal fields of a successful generation", async () => {
        const article = await createArticle({ prisma });
        const created = await generations.create({
            articleId: article.id,
            lockToken: "token-3",
        });
        const quiz = await createQuiz({ prisma, articleId: article.id });

        const finishedAt = new Date("2026-03-01T10:05:00.000Z");

        const saved = await generations.save({
            ...created,
            status: "succeeded",
            quizId: quiz.id,
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 800,
            finishedAt,
        });

        expect(saved).toMatchObject({
            status: "succeeded",
            quizId: quiz.id,
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 800,
            finishedAt,
        });
    });

    it("fails every pending or running row with LOCK_LOST, leaving terminal rows untouched", async () => {
        const article = await createArticle({ prisma });

        const pending = await generations.create({
            articleId: article.id,
            lockToken: "token-4",
        });
        const running = await generations.save({
            ...(await generations.create({
                articleId: article.id,
                lockToken: "token-5",
            })),
            status: "running",
        });
        const alreadySucceeded = await generations.save({
            ...(await generations.create({
                articleId: article.id,
                lockToken: "token-6",
            })),
            status: "succeeded",
            finishedAt: new Date(),
        });

        const now = new Date("2026-03-01T11:00:00.000Z");
        const failed = await generations.failUnfinished(now, null);

        expect(failed.map((row) => row.id).sort()).toEqual(
            [pending.id, running.id].sort(),
        );
        expect(failed.every((row) => row.status === "failed")).toBe(true);
        expect(failed.every((row) => row.failureCode === "LOCK_LOST")).toBe(true);

        await expect(
            generations.findById(alreadySucceeded.id),
        ).resolves.toMatchObject({
            status: "succeeded",
        });
    });

    it("leaves the row matching the live lock holder untouched, failing only the rest", async () => {
        const article = await createArticle({ prisma });

        const stillLive = await generations.create({
            articleId: article.id,
            lockToken: "live-token",
        });
        const orphaned = await generations.save({
            ...(await generations.create({
                articleId: article.id,
                lockToken: "dead-token",
            })),
            status: "running",
        });

        const now = new Date("2026-03-01T11:00:00.000Z");
        const failed = await generations.failUnfinished(now, "live-token");

        expect(failed.map((row) => row.id)).toEqual([orphaned.id]);

        await expect(generations.findById(stillLive.id)).resolves.toMatchObject({
            status: "pending",
        });
        await expect(generations.findById(orphaned.id)).resolves.toMatchObject({
            status: "failed",
            failureCode: "LOCK_LOST",
        });
    });

    it("removes generations when their article is deleted", async () => {
        const article = await createArticle({ prisma });
        const created = await generations.create({
            articleId: article.id,
            lockToken: "token-7",
        });

        await prisma.article.delete({ where: { id: article.id } });

        await expect(generations.findById(created.id)).resolves.toBeNull();
    });
});
