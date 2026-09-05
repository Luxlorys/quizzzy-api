import { correctOptionIds, progressStatusOf, scoreOf } from "./quiz.entity.js";
import type {
    Answer,
    Attempt,
    AttemptSummary,
    GradedAnswer,
    Question,
    QuestionKind,
    Quiz,
    QuizSort,
    QuizSummary,
} from "./quiz.entity.js";
import type {
    AnswerDto,
    AttemptDto,
    AttemptResultDto,
    CreateQuizInput,
    ListQuizzesInput,
    QuizDto,
    QuizListItemDto,
    ReviewedQuestionDto,
    SaveProgressInput,
    StartAttemptInput,
    SubmitAttemptInput,
    UpdateQuizInput,
} from "./quiz.ports.js";
import type { Page } from "@/lib/pagination.js";

type QuestionBody = {
    type: QuestionKind;
    question: string;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
};

type AnswerBody = {
    questionId: number;
    selectedOptionIds: number[];
};

const toAnswerDto = (answer: Answer | AnswerBody): AnswerDto => ({
    questionId: answer.questionId,
    selectedOptionIds: [...answer.selectedOptionIds],
});

export const toCreateQuizInput = (body: {
    articleId: number;
    title: string;
    topic: string;
    questions: QuestionBody[];
}): CreateQuizInput => ({
    articleId: body.articleId,
    title: body.title,
    topic: body.topic,
    questions: body.questions.map((question) => ({
        kind: question.type,
        prompt: question.question,
        explanation: question.explanation,
        options: question.options.map((option) => ({
            text: option.text,
            isCorrect: option.isCorrect,
        })),
    })),
});

export const toUpdateQuizInput = (
    id: number,
    body: { title?: string; topic?: string },
): UpdateQuizInput => ({
    id,
    title: body.title,
    topic: body.topic,
});

export const toListQuizzesInput = (query: {
    limit: number;
    cursor?: number;
    search?: string;
    sort: QuizSort;
}): ListQuizzesInput => ({
    limit: query.limit,
    cursor: query.cursor,
    search: query.search,
    sort: query.sort,
});

export const toStartAttemptInput = (body: {
    quizId: number;
}): StartAttemptInput => ({
    quizId: body.quizId,
});

export const toSaveProgressInput = (
    id: number,
    body: { currentIndex: number; answers: AnswerBody[] },
): SaveProgressInput => ({
    id,
    currentIndex: body.currentIndex,
    answers: body.answers.map(toAnswerDto),
});

export const toSubmitAttemptInput = (
    id: number,
    body: { answers: AnswerBody[] },
): SubmitAttemptInput => ({
    id,
    answers: body.answers.map(toAnswerDto),
});

const toQuestionDto = (question: Question) => ({
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
    })),
});

export const toQuizDto = (quiz: Quiz): QuizDto => ({
    id: quiz.id,
    articleId: quiz.articleId,
    title: quiz.title,
    topic: quiz.topic,
    sourceName: quiz.sourceName,
    questions: quiz.questions.map(toQuestionDto),
    createdAt: quiz.createdAt,
});

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

export const toAttemptDto = (attempt: Attempt): AttemptDto => ({
    id: attempt.id,
    quizId: attempt.quizId,
    status: attempt.status,
    currentIndex: attempt.currentIndex,
    answers: attempt.answers.map(toAnswerDto),
    score: attempt.score,
    total: attempt.total,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
});

const toReviewedQuestionDto = (graded: GradedAnswer): ReviewedQuestionDto => ({
    questionId: graded.question.id,
    kind: graded.question.kind,
    prompt: graded.question.prompt,
    explanation: graded.question.explanation,
    options: graded.question.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
    })),
    selectedOptionIds: graded.selectedOptionIds,
    correctOptionIds: correctOptionIds(graded.question),
    isCorrect: graded.isCorrect,
});

export const toAttemptResultDto = (
    attempt: Attempt,
    quiz: Quiz,
    graded: GradedAnswer[],
): AttemptResultDto => ({
    id: attempt.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: scoreOf(graded),
    total: quiz.questions.length,
    submittedAt: attempt.submittedAt,
    review: graded.map(toReviewedQuestionDto),
});

export const toQuizResponse = (dto: QuizDto) => ({
    id: dto.id,
    articleId: dto.articleId,
    title: dto.title,
    topic: dto.topic,
    sourceName: dto.sourceName,
    createdAt: dto.createdAt.toISOString(),
    questions: dto.questions.map((question) => ({
        id: question.id,
        type: question.kind,
        question: question.prompt,
        options: question.options,
    })),
});

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

export const toAttemptResponse = (dto: AttemptDto) => ({
    id: dto.id,
    quizId: dto.quizId,
    status: dto.status,
    currentIndex: dto.currentIndex,
    answers: dto.answers,
    score: dto.score,
    total: dto.total,
    startedAt: dto.startedAt.toISOString(),
    submittedAt: dto.submittedAt === null ? null : dto.submittedAt.toISOString(),
});

export const toAttemptResultResponse = (dto: AttemptResultDto) => ({
    id: dto.id,
    quizId: dto.quizId,
    quizTitle: dto.quizTitle,
    score: dto.score,
    total: dto.total,
    submittedAt: dto.submittedAt === null ? null : dto.submittedAt.toISOString(),
    review: dto.review.map((entry) => ({
        questionId: entry.questionId,
        type: entry.kind,
        question: entry.prompt,
        explanation: entry.explanation,
        options: entry.options,
        selectedOptionIds: entry.selectedOptionIds,
        correctOptionIds: entry.correctOptionIds,
        isCorrect: entry.isCorrect,
    })),
});
