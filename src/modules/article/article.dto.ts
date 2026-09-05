import type { Article } from "./article.entity.js";
import type {
    ArticleDto,
    ArticleSourceDto,
    SubmitArticleInput,
} from "./article.ports.js";

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

export const toArticleSourceDto = (
    article: Article,
    html: string,
): ArticleSourceDto => ({
    id: article.id,
    filename: article.filename,
    html,
});

export const toArticleResponse = (dto: ArticleDto) => ({
    id: dto.id,
    filename: dto.filename,
    createdAt: dto.createdAt.toISOString(),
});

export const toArticleSourceResponse = (dto: ArticleSourceDto) => ({
    id: dto.id,
    filename: dto.filename,
    html: dto.html,
});
