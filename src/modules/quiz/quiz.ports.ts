import type {
    Attempt,
    AttemptStatus,
    AttemptSummary,
    NewAttempt,
    NewQuiz,
    ProgressStatus,
    QuestionKind,
    Quiz,
    QuizSort,
    QuizSummary,
} from "./quiz.entity.js";
import type { ArticlePublicApi } from "@/modules/article/article.ports.js";
import type { Clock } from "@/lib/clock.js";
import type { Page, PageQuery } from "@/lib/pagination.js";

export type QuizListQuery = PageQuery & {
    search?: string;
    sort: QuizSort;
};

export type QuizRepository = {
    create: (data: NewQuiz) => Promise<Quiz>;
    findById: (id: number) => Promise<Quiz | null>;
    save: (quiz: Quiz) => Promise<Quiz>;
    remove: (id: number) => Promise<void>;
    list: (query: QuizListQuery) => Promise<Page<QuizSummary>>;
};

export type AttemptRepository = {
    create: (data: NewAttempt) => Promise<Attempt>;
    findById: (id: number) => Promise<Attempt | null>;
    save: (attempt: Attempt) => Promise<Attempt>;
    findLatestForQuizzes: (quizIds: number[]) => Promise<AttemptSummary[]>;
};

export type QuizCache = {
    read: (id: number) => Promise<Quiz | null>;
    write: (quiz: Quiz) => Promise<void>;
    forget: (id: number) => Promise<void>;
};

export type AnswerDto = {
    questionId: number;
    selectedOptionIds: number[];
};

export type OptionDto = {
    id: number;
    text: string;
};

export type QuestionDto = {
    id: number;
    kind: QuestionKind;
    prompt: string;
    options: OptionDto[];
};

export type QuizDto = {
    id: number;
    articleId: number;
    title: string;
    topic: string;
    sourceName: string;
    questions: QuestionDto[];
    createdAt: Date;
};

export type QuizListItemDto = {
    id: number;
    title: string;
    topic: string;
    sourceName: string;
    questionCount: number;
    createdAt: Date;
    status: ProgressStatus;
    attemptId: number | null;
    currentIndex: number | null;
    score: number | null;
    total: number | null;
    submittedAt: Date | null;
};

export type AttemptDto = {
    id: number;
    quizId: number;
    status: AttemptStatus;
    currentIndex: number;
    answers: AnswerDto[];
    score: number | null;
    total: number | null;
    startedAt: Date;
    submittedAt: Date | null;
};

export type ReviewedOptionDto = {
    id: number;
    text: string;
    isCorrect: boolean;
};

export type ReviewedQuestionDto = {
    questionId: number;
    kind: QuestionKind;
    prompt: string;
    explanation: string;
    options: ReviewedOptionDto[];
    selectedOptionIds: number[];
    correctOptionIds: number[];
    isCorrect: boolean;
};

export type AttemptResultDto = {
    id: number;
    quizId: number;
    quizTitle: string;
    score: number;
    total: number;
    submittedAt: Date | null;
    review: ReviewedQuestionDto[];
};

export type CreateQuizInput = {
    articleId: number;
    title: string;
    topic: string;
    questions: {
        kind: QuestionKind;
        prompt: string;
        explanation: string;
        options: { text: string; isCorrect: boolean }[];
    }[];
};

export type UpdateQuizInput = {
    id: number;
    title?: string;
    topic?: string;
};

export type ListQuizzesInput = {
    limit: number;
    cursor?: number;
    search?: string;
    sort: QuizSort;
};

export type StartAttemptInput = {
    quizId: number;
};

export type SaveProgressInput = {
    id: number;
    currentIndex: number;
    answers: AnswerDto[];
};

export type SubmitAttemptInput = {
    id: number;
    answers: AnswerDto[];
};

export type QuizService = {
    createQuiz: (input: CreateQuizInput) => Promise<QuizDto>;
    getQuiz: (id: number) => Promise<QuizDto>;
    listQuizzes: (input: ListQuizzesInput) => Promise<Page<QuizListItemDto>>;
    updateQuiz: (input: UpdateQuizInput) => Promise<QuizDto>;
    deleteQuiz: (id: number) => Promise<void>;
    startAttempt: (input: StartAttemptInput) => Promise<AttemptDto>;
    getAttempt: (id: number) => Promise<AttemptDto>;
    saveProgress: (input: SaveProgressInput) => Promise<AttemptDto>;
    submitAttempt: (input: SubmitAttemptInput) => Promise<AttemptResultDto>;
    getAttemptResult: (id: number) => Promise<AttemptResultDto>;
};

export type QuizServiceDeps = {
    repository: QuizRepository;
    attempts: AttemptRepository;
    cache: QuizCache;
    articles: ArticlePublicApi;
    clock: Clock;
};
