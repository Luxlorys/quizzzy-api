export const GENERATION_STATUSES = [
    "pending",
    "running",
    "succeeded",
    "failed",
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const TOPIC_SOURCES = ["existing", "new"] as const;

export type TopicSource = (typeof TOPIC_SOURCES)[number];

export const CANDIDATE_QUESTION_KINDS = ["single", "multi"] as const;

export type CandidateQuestionKind = (typeof CANDIDATE_QUESTION_KINDS)[number];

export const MIN_ARTICLE_TEXT_LENGTH = 200;

export const CANDIDATE_LIMITS = {
    titleMaxLength: 200,
    topicMaxLength: 60,
    promptMaxLength: 1000,
    explanationMaxLength: 2000,
    optionTextMaxLength: 500,
    minOptionsPerQuestion: 2,
    maxOptionsPerQuestion: 8,
} as const;

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

const normaliseText = (text: string): string => text.trim().toLowerCase();

const hasDuplicates = (values: string[]): boolean =>
    new Set(values.map(normaliseText)).size !== values.length;

const questionsNoun = (count: number): string =>
    count === 1 ? "question" : "questions";

const textViolations = (
    label: string,
    text: string,
    maxLength: number,
): string[] => {
    if (text.trim().length === 0) {
        return [`${label} must not be empty`];
    }

    if (text.length > maxLength) {
        return [
            `${label} must be at most ${maxLength} characters, not ${text.length}`,
        ];
    }

    return [];
};

const optionCountViolations = (
    label: string,
    question: CandidateQuestion,
): string[] => {
    const { minOptionsPerQuestion, maxOptionsPerQuestion } = CANDIDATE_LIMITS;
    const count = question.options.length;

    return count < minOptionsPerQuestion || count > maxOptionsPerQuestion
        ? [
              `${label} needs between ${minOptionsPerQuestion} and ${maxOptionsPerQuestion} options, not ${count}`,
          ]
        : [];
};

const answerKeyViolations = (
    label: string,
    question: CandidateQuestion,
): string[] => {
    const correctCount = question.options.filter(
        (option) => option.isCorrect,
    ).length;

    if (question.kind === "single" && correctCount !== 1) {
        return [
            `${label} is single-select and needs exactly one correct option, not ${correctCount}`,
        ];
    }

    if (question.kind === "multi" && correctCount === 0) {
        return [`${label} is multi-select and needs at least one correct option`];
    }

    return [];
};

const questionViolations = (
    question: CandidateQuestion,
    index: number,
): string[] => {
    const label = `question ${index + 1}`;

    return [
        ...textViolations(
            `${label}'s prompt`,
            question.prompt,
            CANDIDATE_LIMITS.promptMaxLength,
        ),
        ...textViolations(
            `${label}'s explanation`,
            question.explanation,
            CANDIDATE_LIMITS.explanationMaxLength,
        ),
        ...optionCountViolations(label, question),
        ...question.options.flatMap((option, optionIndex) =>
            textViolations(
                `${label}'s option ${optionIndex + 1}`,
                option.text,
                CANDIDATE_LIMITS.optionTextMaxLength,
            ),
        ),
        ...(hasDuplicates(question.options.map((option) => option.text))
            ? [`${label}'s option texts must be distinct`]
            : []),
        ...answerKeyViolations(label, question),
    ];
};

const topicViolations = (topic: string): string[] => [
    ...textViolations("the topic", topic, CANDIDATE_LIMITS.topicMaxLength),
    ...(UNSAFE_TOPIC_PATTERN.test(topic)
        ? ["the topic may not contain a newline or angle brackets"]
        : []),
];

const questionCountViolations = (
    questions: CandidateQuestion[],
    range: QuestionRange,
): string[] => {
    const count = questions.length;

    if (count >= range.min && count <= range.max) {
        return [];
    }

    return range.min === range.max
        ? [
              `the quiz needs exactly ${range.min} ${questionsNoun(range.min)}, not ${count}`,
          ]
        : [
              `the quiz needs between ${range.min} and ${range.max} questions, not ${count}`,
          ];
};

export const validateCandidate = (
    candidate: QuizCandidate,
    range: QuestionRange,
): string[] => [
    ...textViolations("the title", candidate.title, CANDIDATE_LIMITS.titleMaxLength),
    ...topicViolations(candidate.topic),
    ...questionCountViolations(candidate.questions, range),
    ...candidate.questions.flatMap((question, index) =>
        questionViolations(question, index),
    ),
    ...(hasDuplicates(candidate.questions.map((question) => question.prompt))
        ? ["question prompts must be distinct across the quiz"]
        : []),
];
