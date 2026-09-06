import type { ArticleDto, ArticleSourceDto } from "./dto.port.js";
import type { ArticleRepository } from "./repository.port.js";
import type { ArticleSourceRepository } from "./source.port.js";

export type SubmitArticleInput = {
    filename: string;
    html: string;
};

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
