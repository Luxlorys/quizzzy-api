import type { QuestionKind, QuizSort } from "../quiz.entity.js";
import type { QuizCache } from "./cache.port.js";
import type {
    AnswerDto,
    AttemptDto,
    AttemptResultDto,
    QuizDto,
    QuizListItemDto,
} from "./dto.port.js";
import type { AttemptRepository, QuizRepository } from "./repository.port.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { Clock } from "@/lib/clock.js";
import type { Page } from "@/lib/pagination.js";

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
    listTopics: () => Promise<string[]>;
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
