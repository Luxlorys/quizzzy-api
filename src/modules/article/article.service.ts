import { acceptSubmission, draftArticle } from "./article.entity.js";
import { toArticleDto, toArticleSourceDto } from "./article.dto.js";
import { ArticleNotFoundError } from "./article.errors.js";
import type { Article } from "./article.entity.js";
import type { ArticleService, ArticleServiceDeps } from "./article.ports.js";

export const createArticleService = ({
    repository,
    sources,
}: ArticleServiceDeps): ArticleService => {
    const loadArticle = async (id: number): Promise<Article> => {
        const article = await repository.findById(id);

        if (article === null) {
            throw new ArticleNotFoundError();
        }

        return article;
    };

    return {
        submitArticle: async (input) => {
            const submission = acceptSubmission(input);
            const sourceKey = await sources.storeSource(submission);

            return toArticleDto(
                await repository.create(draftArticle(submission, sourceKey)),
            );
        },

        getArticle: async (id) => toArticleDto(await loadArticle(id)),

        getArticleSource: async (id) => {
            const article = await loadArticle(id);

            return toArticleSourceDto(
                article,
                await sources.readSource(article.sourceKey),
            );
        },

        deleteArticle: async (id) => {
            const article = await loadArticle(id);

            await repository.remove(article.id);
            await sources.removeSource(article.sourceKey);
        },
    };
};
