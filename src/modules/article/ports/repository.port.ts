import type { Article, NewArticle } from "../article.entity.js";

export type ArticleRepository = {
    create: (data: NewArticle) => Promise<Article>;
    findById: (id: number) => Promise<Article | null>;
    remove: (id: number) => Promise<void>;
};
