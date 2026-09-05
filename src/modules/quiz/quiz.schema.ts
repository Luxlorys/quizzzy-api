import { z } from "zod";
import {
    ATTEMPT_STATUSES,
    PROGRESS_STATUSES,
    QUESTION_KINDS,
    QUIZ_SORTS,
} from "./quiz.entity.js";

const MAX_OPTIONS_PER_QUESTION = 8;
const MAX_QUESTIONS_PER_QUIZ = 30;

const identifier = z.number().int().positive();

export const questionKindSchema = z.enum(QUESTION_KINDS);

export const quizParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const attemptParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const createQuizBodySchema = z.object({
    articleId: identifier,
    title: z.string().trim().min(1).max(200),
    topic: z.string().trim().min(1).max(60),
    questions: z
        .array(
            z.object({
                type: questionKindSchema,
                question: z.string().trim().min(1).max(1000),
                explanation: z.string().trim().max(2000),
                options: z
                    .array(
                        z.object({
                            text: z.string().trim().min(1).max(500),
                            isCorrect: z.boolean(),
                        }),
                    )
                    .min(2)
                    .max(MAX_OPTIONS_PER_QUESTION),
            }),
        )
        .min(1)
        .max(MAX_QUESTIONS_PER_QUIZ),
});

export const updateQuizBodySchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    topic: z.string().trim().min(1).max(60).optional(),
});

export const listQuizzesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.coerce.number().int().positive().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    sort: z.enum(QUIZ_SORTS).default("newest"),
});

export const answerBodySchema = z.object({
    questionId: identifier,
    selectedOptionIds: z.array(identifier).max(MAX_OPTIONS_PER_QUESTION),
});

export const startAttemptBodySchema = z.object({
    quizId: identifier,
});

export const saveProgressBodySchema = z.object({
    currentIndex: z.number().int().min(0).max(MAX_QUESTIONS_PER_QUIZ),
    answers: z.array(answerBodySchema).max(MAX_QUESTIONS_PER_QUIZ),
});

export const submitAttemptBodySchema = z.object({
    answers: z.array(answerBodySchema).max(MAX_QUESTIONS_PER_QUIZ),
});

const answerResponseSchema = z.object({
    questionId: z.number().int(),
    selectedOptionIds: z.array(z.number().int()),
});

const optionResponseSchema = z.object({
    id: z.number().int(),
    text: z.string(),
});

const questionResponseSchema = z.object({
    id: z.number().int(),
    type: questionKindSchema,
    question: z.string(),
    options: z.array(optionResponseSchema),
});

export const quizResponseSchema = z.object({
    id: z.number().int(),
    articleId: z.number().int(),
    title: z.string(),
    topic: z.string(),
    sourceName: z.string(),
    createdAt: z.iso.datetime(),
    questions: z.array(questionResponseSchema),
});

export const quizListItemResponseSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    topic: z.string(),
    sourceName: z.string(),
    questionCount: z.number().int(),
    createdAt: z.iso.datetime(),
    status: z.enum(PROGRESS_STATUSES),
    attemptId: z.number().int().nullable(),
    currentIndex: z.number().int().nullable(),
    score: z.number().int().nullable(),
    total: z.number().int().nullable(),
    submittedAt: z.iso.datetime().nullable(),
});

export const quizPageResponseSchema = z.object({
    items: z.array(quizListItemResponseSchema),
    nextCursor: z.number().int().nullable(),
});

export const attemptResponseSchema = z.object({
    id: z.number().int(),
    quizId: z.number().int(),
    status: z.enum(ATTEMPT_STATUSES),
    currentIndex: z.number().int(),
    answers: z.array(answerResponseSchema),
    score: z.number().int().nullable(),
    total: z.number().int().nullable(),
    startedAt: z.iso.datetime(),
    submittedAt: z.iso.datetime().nullable(),
});

const reviewedOptionResponseSchema = z.object({
    id: z.number().int(),
    text: z.string(),
    isCorrect: z.boolean(),
});

const reviewedQuestionResponseSchema = z.object({
    questionId: z.number().int(),
    type: questionKindSchema,
    question: z.string(),
    explanation: z.string(),
    options: z.array(reviewedOptionResponseSchema),
    selectedOptionIds: z.array(z.number().int()),
    correctOptionIds: z.array(z.number().int()),
    isCorrect: z.boolean(),
});

export const attemptResultResponseSchema = z.object({
    id: z.number().int(),
    quizId: z.number().int(),
    quizTitle: z.string(),
    score: z.number().int(),
    total: z.number().int(),
    submittedAt: z.iso.datetime().nullable(),
    review: z.array(reviewedQuestionResponseSchema),
});
