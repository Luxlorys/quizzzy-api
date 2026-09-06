import type {
    Attempt,
    AttemptSummary,
    NewAttempt,
    NewQuiz,
    Quiz,
    QuizSort,
    QuizSummary,
} from "../quiz.entity.js";
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
    listTopics: () => Promise<string[]>;
};

export type AttemptRepository = {
    create: (data: NewAttempt) => Promise<Attempt>;
    findById: (id: number) => Promise<Attempt | null>;
    save: (attempt: Attempt) => Promise<Attempt>;
    findLatestForQuizzes: (quizIds: number[]) => Promise<AttemptSummary[]>;
};
