import { ArticleSourceMissingError } from "@/modules/article/article.errors.js";
import type { ArticleSourceRepository } from "@/modules/article/ports/source.port.js";

/**
 * A genuine implementation of the ArticleSourceRepository port, not a mock: it
 * honors the same contract article.file.repository.ts honors — a unique key
 * per upload, a read of a key that is not there raising
 * ArticleSourceMissingError, and a remove that is safe to repeat.
 */
export const createInMemoryArticleSourceRepository = (): ArticleSourceRepository & {
    keys: () => string[];
} => {
    let counter = 0;
    const objects = new Map<string, string>();

    return {
        keys: () => [...objects.keys()],

        storeSource: async ({ filename, html }) => {
            const key = `${counter++}-${filename}`;

            objects.set(key, html);

            return key;
        },

        readSource: async (sourceKey) => {
            const html = objects.get(sourceKey);

            if (html === undefined) {
                throw new ArticleSourceMissingError();
            }

            return html;
        },

        removeSource: async (sourceKey) => {
            objects.delete(sourceKey);
        },
    };
};
