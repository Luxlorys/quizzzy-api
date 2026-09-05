import {
    EmptyArticleError,
    UnsupportedArticleFormatError,
} from "./article.errors.js";

export const ARTICLE_EXTENSIONS = [".html", ".htm"] as const;

export type Article = {
    id: number;
    filename: string;
    sourceKey: string;
    createdAt: Date;
};

export type NewArticle = {
    filename: string;
    sourceKey: string;
};

export type ArticleSubmission = {
    filename: string;
    html: string;
};

const hasArticleExtension = (filename: string): boolean =>
    ARTICLE_EXTENSIONS.some((extension) =>
        filename.toLowerCase().endsWith(extension),
    );

export const acceptSubmission = (
    submission: ArticleSubmission,
): ArticleSubmission => {
    if (!hasArticleExtension(submission.filename)) {
        throw new UnsupportedArticleFormatError();
    }

    if (submission.html.trim().length === 0) {
        throw new EmptyArticleError();
    }

    return submission;
};

export const draftArticle = (
    submission: ArticleSubmission,
    sourceKey: string,
): NewArticle => ({
    filename: submission.filename,
    sourceKey,
});
