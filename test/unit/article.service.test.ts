import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryArticleRepository } from "../helpers/in-memory-article-repository.js";
import { createInMemoryArticleSourceRepository } from "../helpers/in-memory-article-source-repository.js";
import { fixedClock } from "../helpers/fixed-clock.js";
import { createArticleService } from "@/modules/article/article.service.js";
import {
    ArticleNotFoundError,
    UnsupportedArticleFormatError,
} from "@/modules/article/article.errors.js";

const HTML = "<html><body><p>Consumer groups</p></body></html>";

const buildService = () => {
    const repository = createInMemoryArticleRepository(
        fixedClock("2026-03-01T10:00:00.000Z"),
    );

    const sources = createInMemoryArticleSourceRepository();

    return {
        repository,
        sources,
        service: createArticleService({ repository, sources }),
    };
};

describe("article service", () => {
    let context: ReturnType<typeof buildService>;

    beforeEach(() => {
        context = buildService();
    });

    it("stores the source before recording the article", async () => {
        const article = await context.service.submitArticle({
            filename: "kafka.html",
            html: HTML,
        });

        expect(article).toMatchObject({ id: 1, filename: "kafka.html" });
        expect(context.repository.rows()).toHaveLength(1);
        expect(context.sources.keys()).toHaveLength(1);
    });

    it("does not record an article whose format the domain rejects", async () => {
        await expect(
            context.service.submitArticle({ filename: "kafka.pdf", html: HTML }),
        ).rejects.toThrow(UnsupportedArticleFormatError);

        expect(context.repository.rows()).toHaveLength(0);
        expect(context.sources.keys()).toHaveLength(0);
    });

    it("reads the stored source back", async () => {
        const article = await context.service.submitArticle({
            filename: "kafka.html",
            html: HTML,
        });

        await expect(context.service.getArticleSource(article.id)).resolves.toEqual({
            id: article.id,
            filename: "kafka.html",
            html: HTML,
        });
    });

    it("removes the row and the stored object on delete", async () => {
        const article = await context.service.submitArticle({
            filename: "kafka.html",
            html: HTML,
        });

        await context.service.deleteArticle(article.id);

        expect(context.repository.rows()).toHaveLength(0);
        expect(context.sources.keys()).toHaveLength(0);
        await expect(context.service.getArticle(article.id)).rejects.toThrow(
            ArticleNotFoundError,
        );
    });

    it("reports a missing article rather than a null", async () => {
        await expect(context.service.getArticle(404)).rejects.toThrow(
            ArticleNotFoundError,
        );
        await expect(context.service.deleteArticle(404)).rejects.toThrow(
            ArticleNotFoundError,
        );
    });
});
