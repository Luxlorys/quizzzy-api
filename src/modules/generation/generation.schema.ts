import { z } from "zod";
import { GENERATION_STATUSES } from "./generation.entity.js";

export const startGenerationBodySchema = z.object({
    articleId: z.number().int().positive(),
});

export const generationParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const generationStatusSchema = z.enum(GENERATION_STATUSES);

export const generationResponseSchema = z.object({
    id: z.number().int(),
    articleId: z.number().int(),
    status: generationStatusSchema,
    quizId: z.number().int().nullable(),
    failureCode: z.string().nullable(),
    failureMessage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
});
