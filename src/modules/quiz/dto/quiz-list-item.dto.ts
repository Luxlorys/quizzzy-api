import { progressStatusOf } from "../quiz.entity.js";
import type { AttemptSummary, ProgressStatus, QuizSummary } from "../quiz.entity.js";
import type { Page } from "@/lib/pagination.js";

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

const NOT_STARTED = {
    status: "new",
    attemptId: null,
    currentIndex: null,
    score: null,
    total: null,
    submittedAt: null,
} as const;

const attemptFieldsOf = (attempt: AttemptSummary | undefined) =>
    attempt === undefined
        ? NOT_STARTED
        : {
              status: progressStatusOf(attempt),
              attemptId: attempt.id,
              currentIndex: attempt.currentIndex,
              score: attempt.score,
              total: attempt.total,
              submittedAt: attempt.submittedAt,
          };

export const toQuizListItemDto = (
    summary: QuizSummary,
    attempt: AttemptSummary | undefined,
): QuizListItemDto => ({
    id: summary.id,
    title: summary.title,
    topic: summary.topic,
    sourceName: summary.sourceName,
    questionCount: summary.questionCount,
    createdAt: summary.createdAt,
    ...attemptFieldsOf(attempt),
});

export const toQuizPageDto = (
    page: Page<QuizSummary>,
    attempts: AttemptSummary[],
): Page<QuizListItemDto> => {
    const latest = new Map(attempts.map((attempt) => [attempt.quizId, attempt]));

    return {
        items: page.items.map((summary) =>
            toQuizListItemDto(summary, latest.get(summary.id)),
        ),
        nextCursor: page.nextCursor,
    };
};

export const toQuizListItemResponse = (dto: QuizListItemDto) => ({
    id: dto.id,
    title: dto.title,
    topic: dto.topic,
    sourceName: dto.sourceName,
    questionCount: dto.questionCount,
    createdAt: dto.createdAt.toISOString(),
    status: dto.status,
    attemptId: dto.attemptId,
    currentIndex: dto.currentIndex,
    score: dto.score,
    total: dto.total,
    submittedAt: dto.submittedAt === null ? null : dto.submittedAt.toISOString(),
});

export const toQuizPageResponse = (page: Page<QuizListItemDto>) => ({
    items: page.items.map(toQuizListItemResponse),
    nextCursor: page.nextCursor,
});
