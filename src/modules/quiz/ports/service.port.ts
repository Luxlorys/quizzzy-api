import type { QuizCache } from "./cache.port.js";
import type { AttemptRepository, QuizRepository } from "./repository.port.js";
import type { AttemptResultDto } from "../dto/attempt-result.dto.js";
import type {
    AttemptDto,
    SaveProgressInput,
    StartAttemptInput,
    SubmitAttemptInput,
} from "../dto/attempt.dto.js";
import type { QuizListItemDto } from "../dto/quiz-list-item.dto.js";
import type {
    CreateQuizInput,
    ListQuizzesInput,
    QuizDto,
    UpdateQuizInput,
} from "../dto/quiz.dto.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { Clock } from "@/lib/clock.js";
import type { Page } from "@/lib/pagination.js";

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
