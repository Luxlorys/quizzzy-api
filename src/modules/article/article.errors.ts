import { NotFoundError, UnprocessableError } from "@/lib/errors.js";

export class ArticleNotFoundError extends NotFoundError {
    constructor() {
        super("Article not found.");
    }
}

export class ArticleSourceMissingError extends NotFoundError {
    constructor() {
        super("The stored source for this article is no longer available.");
    }
}

export class EmptyArticleError extends UnprocessableError {
    constructor() {
        super("The article contains no content.");
    }
}

export class UnsupportedArticleFormatError extends UnprocessableError {
    constructor() {
        super("Only .html and .htm files can be submitted.");
    }
}
