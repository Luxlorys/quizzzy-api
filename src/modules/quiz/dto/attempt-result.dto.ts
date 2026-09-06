import { correctOptionIds, scoreOf } from "../quiz.entity.js";
import type { Attempt, GradedAnswer, QuestionKind, Quiz } from "../quiz.entity.js";

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
