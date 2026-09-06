import type { Answer, Attempt, AttemptStatus } from "../quiz.entity.js";

export type AnswerDto = {
    questionId: number;
    selectedOptionIds: number[];
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

type AnswerBody = {
    questionId: number;
    selectedOptionIds: number[];
};

const toAnswerDto = (answer: Answer | AnswerBody): AnswerDto => ({
    questionId: answer.questionId,
    selectedOptionIds: [...answer.selectedOptionIds],
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
