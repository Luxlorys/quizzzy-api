import type { Article } from "../article.entity.js";

export type ArticleSourceDto = {
    id: number;
    filename: string;
    html: string;
};

export const toArticleSourceDto = (
    article: Article,
    html: string,
): ArticleSourceDto => ({
    id: article.id,
    filename: article.filename,
    html,
});

export const toArticleSourceResponse = (dto: ArticleSourceDto) => ({
    id: dto.id,
    filename: dto.filename,
    html: dto.html,
});
