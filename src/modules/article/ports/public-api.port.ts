export type ArticleRef = {
    id: number;
    filename: string;
};

export type ArticleSourceRef = {
    id: number;
    filename: string;
    html: string;
};

export type ArticlePublicApi = {
    getArticle: (articleId: number) => Promise<ArticleRef>;
    readArticleSource: (articleId: number) => Promise<ArticleSourceRef>;
};
