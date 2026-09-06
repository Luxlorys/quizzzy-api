import type { Generation } from "./generation.entity.js";
import type { GenerationDto } from "./ports/dto.port.js";
import type { StartGenerationInput } from "./ports/service.port.js";

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

export const toStartGenerationInput = (body: {
    articleId: number;
}): StartGenerationInput => ({
    articleId: body.articleId,
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
