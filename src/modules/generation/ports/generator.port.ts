import type { QuizCandidate } from "../generation.entity.js";

export type GenerationUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
};

export type GenerateQuizInput = {
    articleHtml: string;
    filename: string;
    knownTopics: string[];
};

export type QuizGenerator = {
    generate: (
        input: GenerateQuizInput,
    ) => Promise<{ candidate: QuizCandidate; usage: GenerationUsage }>;
};
