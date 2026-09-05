import type { Article, ArticleSubmission, NewArticle } from "./article.entity.js";

export type ArticleRepository = {
    create: (data: NewArticle) => Promise<Article>;
    findById: (id: number) => Promise<Article | null>;
    remove: (id: number) => Promise<void>;
};

export type ArticleSourceRepository = {
    storeSource: (submission: ArticleSubmission) => Promise<string>;
    readSource: (sourceKey: string) => Promise<string>;
    removeSource: (sourceKey: string) => Promise<void>;
};

export type ArticleDto = {
    id: number;
    filename: string;
    createdAt: Date;
};

export type ArticleSourceDto = {
    id: number;
    filename: string;
    html: string;
};

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

export type ArticleRef = {
    id: number;
    filename: string;
};

export type ArticlePublicApi = {
    getArticle: (articleId: number) => Promise<ArticleRef>;
};
