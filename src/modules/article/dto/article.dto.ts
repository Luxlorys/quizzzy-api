import type { Article } from "../article.entity.js";

export type SubmitArticleInput = {
    filename: string;
    html: string;
};

export type ArticleDto = {
    id: number;
    filename: string;
    createdAt: Date;
};

export const toSubmitArticleInput = (body: {
    filename: string;
    html: string;
}): SubmitArticleInput => ({
    filename: body.filename,
    html: body.html,
});

export const toArticleDto = (article: Article): ArticleDto => ({
    id: article.id,
    filename: article.filename,
    createdAt: article.createdAt,
});

export const toArticleResponse = (dto: ArticleDto) => ({
    id: dto.id,
    filename: dto.filename,
    createdAt: dto.createdAt.toISOString(),
});
