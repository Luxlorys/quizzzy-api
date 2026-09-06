import type { Generation, GenerationStatus } from "../generation.entity.js";

export type StartGenerationInput = {
    articleId: number;
};

export type GenerationDto = {
    id: number;
    articleId: number;
    status: GenerationStatus;
    quizId: number | null;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: Date;
    finishedAt: Date | null;
};

export const toStartGenerationInput = (body: {
    articleId: number;
}): StartGenerationInput => ({
    articleId: body.articleId,
});

export const toGenerationDto = (generation: Generation): GenerationDto => ({
    id: generation.id,
    articleId: generation.articleId,
    status: generation.status,
    quizId: generation.quizId,
    failureCode: generation.failureCode,
    failureMessage: generation.failureMessage,
    createdAt: generation.createdAt,
    finishedAt: generation.finishedAt,
});

export const toGenerationResponse = (dto: GenerationDto) => ({
    id: dto.id,
    articleId: dto.articleId,
    status: dto.status,
    quizId: dto.quizId,
    failureCode: dto.failureCode,
    failureMessage: dto.failureMessage,
    createdAt: dto.createdAt.toISOString(),
    finishedAt: dto.finishedAt === null ? null : dto.finishedAt.toISOString(),
});
