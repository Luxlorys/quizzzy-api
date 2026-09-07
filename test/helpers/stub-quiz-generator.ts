import type { QuizCandidate } from "@/modules/generation/generation.entity.js";
import type {
    GenerateQuizInput,
    GenerationAttempt,
    GenerationUsage,
    QuizGenerator,
} from "@/modules/generation/ports/generator.port.js";

export const cannedCandidate = (
    overrides: Partial<QuizCandidate> = {},
): QuizCandidate => ({
    title: "AWS Lambda Cold Starts",
    topic: "AWS",
    topicSource: "new",
    questions: [
        {
            kind: "single",
            prompt: "What causes a cold start?",
            explanation: "A fresh execution environment must be initialized.",
            options: [
                { text: "A new execution environment", isCorrect: true },
                { text: "Low memory", isCorrect: false },
            ],
        },
    ],
    ...overrides,
});

export const CANNED_USAGE: GenerationUsage = {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
};

export const cannedAttempt = (
    candidate: QuizCandidate = cannedCandidate(),
    usage: GenerationUsage = CANNED_USAGE,
): GenerationAttempt => ({
    candidate,
    usage,
    correct: async () => cannedAttempt(candidate, usage),
});

export type StubQuizGenerator = QuizGenerator & {
    calls: () => GenerateQuizInput[];
};

export const createStubQuizGenerator = (
    behavior: (input: GenerateQuizInput) => Promise<GenerationAttempt> = async () =>
        cannedAttempt(),
): StubQuizGenerator => {
    const calls: GenerateQuizInput[] = [];

    return {
        calls: () => [...calls],
        generate: async (input) => {
            calls.push(input);

            return behavior(input);
        },
    };
};

export type SequencedQuizGenerator = StubQuizGenerator & {
    corrections: () => string[][];
};

export const createSequencedQuizGenerator = (
    first: QuizCandidate,
    ...rest: QuizCandidate[]
): SequencedQuizGenerator => {
    const corrections: string[][] = [];

    const attemptFor = (
        candidate: QuizCandidate,
        remaining: QuizCandidate[],
    ): GenerationAttempt => ({
        candidate,
        usage: CANNED_USAGE,
        correct: async (reasons) => {
            corrections.push(reasons);

            return attemptFor(remaining[0] ?? candidate, remaining.slice(1));
        },
    });

    return {
        ...createStubQuizGenerator(async () => attemptFor(first, rest)),
        corrections: () => [...corrections],
    };
};
