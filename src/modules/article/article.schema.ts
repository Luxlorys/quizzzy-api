import { z } from "zod";

export const MAX_ARTICLE_CHARACTERS = 2_000_000;

export const submitArticleBodySchema = z.object({
    filename: z.string().trim().min(1).max(255),
    html: z.string().min(1).max(MAX_ARTICLE_CHARACTERS),
});

export const articleParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const articleResponseSchema = z.object({
    id: z.number().int(),
    filename: z.string(),
    createdAt: z.iso.datetime(),
});

export const articleSourceResponseSchema = z.object({
    id: z.number().int(),
    filename: z.string(),
    html: z.string(),
});
