import type { AttemptStatus, ProgressStatus, QuestionKind } from "../quiz.entity.js";

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
