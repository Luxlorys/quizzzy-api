import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArticleSourceMissingError } from "./article.errors.js";
import type { ArticleSourceRepository } from "./ports/source.port.js";

const SLUG_FALLBACK = "article";
const MAX_SLUG_LENGTH = 60;

const slugify = (filename: string): string => {
    const slug = path
        .basename(filename, path.extname(filename))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH);

    return slug.length === 0 ? SLUG_FALLBACK : slug;
};

const isMissingFile = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";

export const createFileArticleSourceRepository = (
    directory: string,
): ArticleSourceRepository => {
    const pathFor = (key: string) => path.join(directory, path.basename(key));

    return {
        storeSource: async ({ filename, html }) => {
            await mkdir(directory, { recursive: true });

            const key = `${randomUUID()}-${slugify(filename)}.html`;

            await writeFile(pathFor(key), html, "utf-8");

            return key;
        },

        readSource: async (sourceKey) =>
            readFile(pathFor(sourceKey), "utf-8").catch((error: unknown) => {
                if (isMissingFile(error)) {
                    throw new ArticleSourceMissingError();
                }

                throw error;
            }),

        removeSource: async (sourceKey) => {
            await rm(pathFor(sourceKey), { force: true });
        },
    };
};
