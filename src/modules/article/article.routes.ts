import {
    articleParamsSchema,
    articleResponseSchema,
    articleSourceResponseSchema,
    submitArticleBodySchema,
} from "./article.schema.js";
import {
    toArticleResponse,
    toArticleSourceResponse,
    toSubmitArticleInput,
} from "./article.dto.js";
import { errorResponseSchema, noContentSchema } from "@/lib/schemas.js";
import type { ArticleService } from "./article.ports.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const ARTICLE_TAG = "articles";

export const articleRoutes =
    (service: ArticleService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [ARTICLE_TAG],
                    summary: "Submit an article's saved HTML",
                    body: submitArticleBodySchema,
                    response: {
                        201: articleResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const article = await service.submitArticle(
                    toSubmitArticleInput(request.body),
                );

                return reply.code(201).send(toArticleResponse(article));
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [ARTICLE_TAG],
                    summary: "Get an article by id",
                    params: articleParamsSchema,
                    response: {
                        200: articleResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const article = await service.getArticle(request.params.id);

                return toArticleResponse(article);
            },
        );

        fastify.get(
            "/:id/source",
            {
                schema: {
                    tags: [ARTICLE_TAG],
                    summary: "Get an article's stored HTML",
                    params: articleParamsSchema,
                    response: {
                        200: articleSourceResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const source = await service.getArticleSource(request.params.id);

                return toArticleSourceResponse(source);
            },
        );

        fastify.delete(
            "/:id",
            {
                schema: {
                    tags: [ARTICLE_TAG],
                    summary: "Delete an article and every quiz built from it",
                    params: articleParamsSchema,
                    response: {
                        204: noContentSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                await service.deleteArticle(request.params.id);

                return reply.code(204).send();
            },
        );
    };
