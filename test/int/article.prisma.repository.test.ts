import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArticle } from "./factories/article.factory.js";
import { PrismaClient } from "@/generated/prisma/client.js";
import { createPrismaArticleRepository } from "@/modules/article/article.prisma.repository.js";
import { ArticleNotFoundError } from "@/modules/article/article.errors.js";

describe("Prisma article repository", () => {
    let prisma: PrismaClient;
    let repository: ReturnType<typeof createPrismaArticleRepository>;

    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        });

        await prisma.$connect();

        repository = createPrismaArticleRepository(prisma);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("round-trips an article through the database", async () => {
        const created = await repository.create({
            filename: "kafka-consumer-groups.html",
            sourceKey: "abc-kafka-consumer-groups.html",
        });

        expect(created.id).toBeGreaterThan(0);
        expect(created.createdAt).toBeInstanceOf(Date);

        await expect(repository.findById(created.id)).resolves.toEqual(created);
    });

    it("returns null for an article that is not there", async () => {
        await expect(repository.findById(404)).resolves.toBeNull();
    });

    it("translates a delete of a missing row into a domain error", async () => {
        const row = await createArticle({ prisma });

        await repository.remove(row.id);

        await expect(repository.findById(row.id)).resolves.toBeNull();
        await expect(repository.remove(row.id)).rejects.toThrow(
            ArticleNotFoundError,
        );
    });
});
