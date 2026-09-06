import type { ArticleSubmission } from "../article.entity.js";

export type ArticleSourceRepository = {
    storeSource: (submission: ArticleSubmission) => Promise<string>;
    readSource: (sourceKey: string) => Promise<string>;
    removeSource: (sourceKey: string) => Promise<void>;
};
