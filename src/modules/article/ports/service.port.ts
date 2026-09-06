import type { ArticleRepository } from "./repository.port.js";
import type { ArticleSourceRepository } from "./source.port.js";
import type { ArticleSourceDto } from "../dto/article-source.dto.js";
import type { ArticleDto, SubmitArticleInput } from "../dto/article.dto.js";

export type ArticleService = {
    submitArticle: (input: SubmitArticleInput) => Promise<ArticleDto>;
    getArticle: (id: number) => Promise<ArticleDto>;
    getArticleSource: (id: number) => Promise<ArticleSourceDto>;
    deleteArticle: (id: number) => Promise<void>;
};

export type ArticleServiceDeps = {
    repository: ArticleRepository;
    sources: ArticleSourceRepository;
};
