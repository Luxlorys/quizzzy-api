import type { Question, QuestionKind, Quiz, QuizSort } from "../quiz.entity.js";

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

type QuestionBody = {
    type: QuestionKind;
    question: string;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
};

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

const toQuestionDto = (question: Question): QuestionDto => ({
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
