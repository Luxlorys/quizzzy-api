import fp from "fastify-plugin";
import { createFileArticleSourceRepository } from "./article.file.repository.js";
import { createPrismaArticleRepository } from "./article.prisma.repository.js";
import { createArticleService } from "./article.service.js";
import { articleRoutes } from "./article.routes.js";
import type { ArticlePublicApi } from "./ports/public-api.port.js";
import type { FastifyInstance } from "fastify";

const articleModule = async (fastify: FastifyInstance) => {
    const repository = createPrismaArticleRepository(fastify.prisma);

    const sources = createFileArticleSourceRepository(
        fastify.config.ARTICLE_STORAGE_DIR,
    );

    const service = createArticleService({ repository, sources });

    const publicApi: ArticlePublicApi = {
        getArticle: service.getArticle,
        readArticleSource: service.getArticleSource,
    };

    fastify.decorate("articleService", publicApi);

    await fastify.register(articleRoutes(service), { prefix: "/api/articles" });
};

export default fp(articleModule, { name: "article-module" });
