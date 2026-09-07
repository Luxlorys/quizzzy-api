import type { QuestionRange, QuizCandidate } from "../generation.entity.js";

export type GenerationUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
};

export type GenerateQuizInput = {
    articleText: string;
    filename: string;
    knownTopics: string[];
    questionRange: QuestionRange;
};

export type GenerationAttempt = {
    candidate: QuizCandidate;
    usage: GenerationUsage;
    correct: (reasons: string[]) => Promise<GenerationAttempt>;
};

export type QuizGenerator = {
    generate: (input: GenerateQuizInput) => Promise<GenerationAttempt>;
};
