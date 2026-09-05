import {
    AttemptAlreadySubmittedError,
    AttemptNotSubmittedError,
    DuplicateAnswerError,
    EmptyQuizError,
    InvalidAnswerKeyError,
    InvalidSelectionError,
    NotEnoughOptionsError,
    QuestionOutOfRangeError,
    UnknownOptionError,
    UnknownQuestionError,
} from "./quiz.errors.js";

export const QUESTION_KINDS = ["single", "multi"] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const ATTEMPT_STATUSES = ["draft", "submitted"] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const PROGRESS_STATUSES = ["new", "draft", "done"] as const;

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export const QUIZ_SORTS = ["newest", "title"] as const;

export type QuizSort = (typeof QUIZ_SORTS)[number];

const MIN_OPTIONS_PER_QUESTION = 2;

export type Option = {
    id: number;
    text: string;
    isCorrect: boolean;
};

export type Question = {
    id: number;
    position: number;
    kind: QuestionKind;
    prompt: string;
    explanation: string;
    options: Option[];
};

export type Quiz = {
    id: number;
    articleId: number;
    title: string;
    topic: string;
    sourceName: string;
    questions: Question[];
    createdAt: Date;
};

export type QuizSummary = {
    id: number;
    title: string;
    topic: string;
    sourceName: string;
    questionCount: number;
    createdAt: Date;
};

export type NewOption = {
    text: string;
    isCorrect: boolean;
};

export type NewQuestion = {
    position: number;
    kind: QuestionKind;
    prompt: string;
    explanation: string;
    options: NewOption[];
};

export type NewQuiz = {
    articleId: number;
    title: string;
    topic: string;
    sourceName: string;
    questions: NewQuestion[];
};

export type DraftOption = {
    text: string;
    isCorrect: boolean;
};

export type DraftQuestion = {
    kind: QuestionKind;
    prompt: string;
    explanation: string;
    options: DraftOption[];
};

export type DraftQuiz = {
    articleId: number;
    title: string;
    topic: string;
    sourceName: string;
    questions: DraftQuestion[];
};

export type QuizChanges = {
    title?: string;
    topic?: string;
};

export type Answer = {
    questionId: number;
    selectedOptionIds: number[];
};

export type Attempt = {
    id: number;
    quizId: number;
    status: AttemptStatus;
    currentIndex: number;
    answers: Answer[];
    score: number | null;
    total: number | null;
    startedAt: Date;
    submittedAt: Date | null;
};

export type NewAttempt = {
    quizId: number;
    currentIndex: number;
    answers: Answer[];
    startedAt: Date;
};

export type AttemptSummary = {
    id: number;
    quizId: number;
    status: AttemptStatus;
    currentIndex: number;
    score: number | null;
    total: number | null;
    submittedAt: Date | null;
};

export type AttemptProgress = {
    currentIndex: number;
    answers: Answer[];
};

export type GradedAnswer = {
    question: Question;
    selectedOptionIds: number[];
    isCorrect: boolean;
};

export const correctOptionIds = (question: Question): number[] =>
    question.options.filter((option) => option.isCorrect).map((option) => option.id);

const hasUsableAnswerKey = (kind: QuestionKind, correctCount: number): boolean =>
    kind === "single" ? correctCount === 1 : correctCount > 0;

const assertAnswerable = (question: DraftQuestion): void => {
    if (question.options.length < MIN_OPTIONS_PER_QUESTION) {
        throw new NotEnoughOptionsError();
    }

    const correctCount = question.options.filter(
        (option) => option.isCorrect,
    ).length;

    if (!hasUsableAnswerKey(question.kind, correctCount)) {
        throw new InvalidAnswerKeyError();
    }
};

const positionedQuestion = (
    question: DraftQuestion,
    index: number,
): NewQuestion => ({
    position: index,
    kind: question.kind,
    prompt: question.prompt,
    explanation: question.explanation,
    options: question.options.map((option) => ({
        text: option.text,
        isCorrect: option.isCorrect,
    })),
});

export const draftQuiz = (draft: DraftQuiz): NewQuiz => {
    if (draft.questions.length === 0) {
        throw new EmptyQuizError();
    }

    draft.questions.forEach(assertAnswerable);

    return {
        articleId: draft.articleId,
        title: draft.title,
        topic: draft.topic,
        sourceName: draft.sourceName,
        questions: draft.questions.map(positionedQuestion),
    };
};

export const renameQuiz = (quiz: Quiz, changes: QuizChanges): Quiz => ({
    ...quiz,
    title: changes.title ?? quiz.title,
    topic: changes.topic ?? quiz.topic,
});

export const progressStatusOf = (
    attempt: AttemptSummary | undefined,
): ProgressStatus => {
    if (attempt === undefined) {
        return "new";
    }

    return attempt.status === "submitted" ? "done" : "draft";
};

export const startAttempt = (quiz: Quiz, now: Date): NewAttempt => ({
    quizId: quiz.id,
    currentIndex: 0,
    answers: [],
    startedAt: now,
});

const assertDraft = (attempt: Attempt): void => {
    if (attempt.status === "submitted") {
        throw new AttemptAlreadySubmittedError();
    }
};

export const assertSubmitted = (attempt: Attempt): void => {
    if (attempt.status !== "submitted") {
        throw new AttemptNotSubmittedError();
    }
};

const assertQuestionIndex = (quiz: Quiz, index: number): void => {
    if (index < 0 || index >= quiz.questions.length) {
        throw new QuestionOutOfRangeError();
    }
};

const assertSelectionFits = (question: Question, selected: number[]): void => {
    const offered = new Set(question.options.map((option) => option.id));

    if (!selected.every((optionId) => offered.has(optionId))) {
        throw new UnknownOptionError();
    }

    if (question.kind === "single" && selected.length > 1) {
        throw new InvalidSelectionError();
    }
};

const acceptAnswer = (quiz: Quiz, answer: Answer): Answer => {
    const question = quiz.questions.find(
        (candidate) => candidate.id === answer.questionId,
    );

    if (question === undefined) {
        throw new UnknownQuestionError();
    }

    const selectedOptionIds = [...new Set(answer.selectedOptionIds)];

    assertSelectionFits(question, selectedOptionIds);

    return { questionId: question.id, selectedOptionIds };
};

const acceptAnswers = (quiz: Quiz, answers: Answer[]): Answer[] => {
    const questionIds = new Set(answers.map((answer) => answer.questionId));

    if (questionIds.size !== answers.length) {
        throw new DuplicateAnswerError();
    }

    return answers.map((answer) => acceptAnswer(quiz, answer));
};

export const recordProgress = (
    attempt: Attempt,
    quiz: Quiz,
    progress: AttemptProgress,
): Attempt => {
    assertDraft(attempt);
    assertQuestionIndex(quiz, progress.currentIndex);

    return {
        ...attempt,
        currentIndex: progress.currentIndex,
        answers: acceptAnswers(quiz, progress.answers),
    };
};

const isAnswerCorrect = (question: Question, selected: number[]): boolean => {
    const expected = correctOptionIds(question);

    return (
        expected.length === selected.length &&
        expected.every((optionId) => selected.includes(optionId))
    );
};

export const scoreOf = (graded: GradedAnswer[]): number =>
    graded.filter((entry) => entry.isCorrect).length;

export const gradeAnswers = (quiz: Quiz, answers: Answer[]): GradedAnswer[] =>
    quiz.questions.map((question) => {
        const selectedOptionIds =
            answers.find((answer) => answer.questionId === question.id)
                ?.selectedOptionIds ?? [];

        return {
            question,
            selectedOptionIds,
            isCorrect: isAnswerCorrect(question, selectedOptionIds),
        };
    });

export const submitAttempt = (
    attempt: Attempt,
    quiz: Quiz,
    answers: Answer[],
    now: Date,
): Attempt => {
    assertDraft(attempt);

    const accepted = acceptAnswers(quiz, answers);
    const graded = gradeAnswers(quiz, accepted);

    return {
        ...attempt,
        status: "submitted",
        answers: accepted,
        score: scoreOf(graded),
        total: quiz.questions.length,
        submittedAt: now,
    };
};
