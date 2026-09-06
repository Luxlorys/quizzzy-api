import type { GenerationStatus } from "../generation.entity.js";

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
