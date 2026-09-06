import {
    DuplicateCandidateOptionError,
    DuplicateCandidatePromptError,
    InvalidCandidateAnswerKeyError,
    QuestionCountOutOfRangeError,
    UnsafeTopicError,
} from "./generation.errors.js";

export const GENERATION_STATUSES = [
    "pending",
    "running",
    "succeeded",
    "failed",
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const TOPIC_SOURCES = ["existing", "new"] as const;

export type TopicSource = (typeof TOPIC_SOURCES)[number];

type CandidateQuestionKind = "single" | "multi";

const MIN_OPTIONS_PER_QUESTION = 2;

const WORDS_PER_QUESTION_AT_CEILING = 150;
const WORDS_PER_QUESTION_AT_FLOOR = 400;

export type Generation = {
    id: number;
    articleId: number;
    status: GenerationStatus;
    lockToken: string;
    quizId: number | null;
    failureCode: string | null;
    failureMessage: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    createdAt: Date;
    updatedAt: Date;
    finishedAt: Date | null;
};

export type NewGeneration = {
    articleId: number;
    lockToken: string;
};

export type CandidateOption = {
    text: string;
    isCorrect: boolean;
};

export type CandidateQuestion = {
    kind: CandidateQuestionKind;
    prompt: string;
    explanation: string;
    options: CandidateOption[];
};

export type QuizCandidate = {
    title: string;
    topic: string;
    topicSource: TopicSource;
    questions: CandidateQuestion[];
};

export type QuestionBounds = {
    min: number;
    max: number;
};

export type QuestionRange = {
    min: number;
    max: number;
};

const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), high);

export const planQuestionRange = (
    wordCount: number,
    bounds: QuestionBounds,
): QuestionRange => {
    const max = clamp(
        Math.round(wordCount / WORDS_PER_QUESTION_AT_CEILING),
        1,
        bounds.max,
    );

    const min = Math.min(
        clamp(
            Math.round(wordCount / WORDS_PER_QUESTION_AT_FLOOR),
            bounds.min,
            bounds.max,
        ),
        max,
    );

    return { min, max };
};

export type ReconciledTopic = {
    topic: string;
    topicSource: TopicSource;
};

const normaliseTopic = (topic: string): string => topic.trim().replace(/\s+/g, " ");

export const reconcileTopic = (
    candidateTopic: string,
    vocabulary: string[],
): ReconciledTopic => {
    const normalisedCandidate = normaliseTopic(candidateTopic);

    const match = vocabulary.find(
        (existing) =>
            normaliseTopic(existing).toLowerCase() ===
            normalisedCandidate.toLowerCase(),
    );

    return match !== undefined
        ? { topic: match, topicSource: "existing" }
        : { topic: normalisedCandidate, topicSource: "new" };
};

const UNSAFE_TOPIC_PATTERN = /[\n<>]/;

const assertSafeTopic = (topic: string): void => {
    if (UNSAFE_TOPIC_PATTERN.test(topic)) {
        throw new UnsafeTopicError();
    }
};

const hasUsableAnswerKey = (
    kind: CandidateQuestionKind,
    correctCount: number,
): boolean => (kind === "single" ? correctCount === 1 : correctCount > 0);

const assertValidAnswerKey = (question: CandidateQuestion): void => {
    if (question.options.length < MIN_OPTIONS_PER_QUESTION) {
        throw new InvalidCandidateAnswerKeyError();
    }

    const correctCount = question.options.filter(
        (option) => option.isCorrect,
    ).length;

    if (!hasUsableAnswerKey(question.kind, correctCount)) {
        throw new InvalidCandidateAnswerKeyError();
    }
};

const assertUniqueOptionTexts = (question: CandidateQuestion): void => {
    const normalised = question.options.map((option) =>
        option.text.trim().toLowerCase(),
    );

    if (new Set(normalised).size !== normalised.length) {
        throw new DuplicateCandidateOptionError();
    }
};

const assertUniquePrompts = (questions: CandidateQuestion[]): void => {
    const normalised = questions.map((question) =>
        question.prompt.trim().toLowerCase(),
    );

    if (new Set(normalised).size !== normalised.length) {
        throw new DuplicateCandidatePromptError();
    }
};

const assertQuestionCountInRange = (
    questions: CandidateQuestion[],
    range: QuestionRange,
): void => {
    if (questions.length < range.min || questions.length > range.max) {
        throw new QuestionCountOutOfRangeError(
            questions.length,
            range.min,
            range.max,
        );
    }
};

export const assertValidCandidate = (
    candidate: QuizCandidate,
    range: QuestionRange,
): void => {
    assertSafeTopic(candidate.topic);
    assertQuestionCountInRange(candidate.questions, range);
    candidate.questions.forEach(assertValidAnswerKey);
    candidate.questions.forEach(assertUniqueOptionTexts);
    assertUniquePrompts(candidate.questions);
};
