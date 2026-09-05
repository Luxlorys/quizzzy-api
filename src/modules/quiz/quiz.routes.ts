import {
    attemptParamsSchema,
    attemptResponseSchema,
    attemptResultResponseSchema,
    createQuizBodySchema,
    listQuizzesQuerySchema,
    quizPageResponseSchema,
    quizParamsSchema,
    quizResponseSchema,
    saveProgressBodySchema,
    startAttemptBodySchema,
    submitAttemptBodySchema,
    updateQuizBodySchema,
} from "./quiz.schema.js";
import {
    toAttemptResponse,
    toAttemptResultResponse,
    toCreateQuizInput,
    toListQuizzesInput,
    toQuizPageResponse,
    toQuizResponse,
    toSaveProgressInput,
    toStartAttemptInput,
    toSubmitAttemptInput,
    toUpdateQuizInput,
} from "./quiz.dto.js";
import { errorResponseSchema, noContentSchema } from "@/lib/schemas.js";
import type { QuizService } from "./quiz.ports.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const QUIZ_TAG = "quizzes";
const ATTEMPT_TAG = "attempts";

export const quizRoutes =
    (service: QuizService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [QUIZ_TAG],
                    summary: "Create a quiz for an article",
                    body: createQuizBodySchema,
                    response: {
                        201: quizResponseSchema,
                        404: errorResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const quiz = await service.createQuiz(
                    toCreateQuizInput(request.body),
                );

                return reply.code(201).send(toQuizResponse(quiz));
            },
        );

        fastify.get(
            "/",
            {
                schema: {
                    tags: [QUIZ_TAG],
                    summary: "List quizzes with their latest attempt",
                    querystring: listQuizzesQuerySchema,
                    response: {
                        200: quizPageResponseSchema,
                    },
                },
            },
            async (request) => {
                const page = await service.listQuizzes(
                    toListQuizzesInput(request.query),
                );

                return toQuizPageResponse(page);
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [QUIZ_TAG],
                    summary: "Get a quiz to take (no answer key)",
                    params: quizParamsSchema,
                    response: {
                        200: quizResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const quiz = await service.getQuiz(request.params.id);

                return toQuizResponse(quiz);
            },
        );

        fastify.patch(
            "/:id",
            {
                schema: {
                    tags: [QUIZ_TAG],
                    summary: "Rename a quiz or change its topic",
                    params: quizParamsSchema,
                    body: updateQuizBodySchema,
                    response: {
                        200: quizResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const quiz = await service.updateQuiz(
                    toUpdateQuizInput(request.params.id, request.body),
                );

                return toQuizResponse(quiz);
            },
        );

        fastify.delete(
            "/:id",
            {
                schema: {
                    tags: [QUIZ_TAG],
                    summary: "Delete a quiz and its attempts",
                    params: quizParamsSchema,
                    response: {
                        204: noContentSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                await service.deleteQuiz(request.params.id);

                return reply.code(204).send();
            },
        );
    };

export const attemptRoutes =
    (service: QuizService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [ATTEMPT_TAG],
                    summary: "Start a fresh attempt at a quiz",
                    body: startAttemptBodySchema,
                    response: {
                        201: attemptResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const attempt = await service.startAttempt(
                    toStartAttemptInput(request.body),
                );

                return reply.code(201).send(toAttemptResponse(attempt));
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [ATTEMPT_TAG],
                    summary: "Get an attempt and its saved progress",
                    params: attemptParamsSchema,
                    response: {
                        200: attemptResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const attempt = await service.getAttempt(request.params.id);

                return toAttemptResponse(attempt);
            },
        );

        fastify.patch(
            "/:id",
            {
                schema: {
                    tags: [ATTEMPT_TAG],
                    summary: "Save progress and leave the attempt as a draft",
                    params: attemptParamsSchema,
                    body: saveProgressBodySchema,
                    response: {
                        200: attemptResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const attempt = await service.saveProgress(
                    toSaveProgressInput(request.params.id, request.body),
                );

                return toAttemptResponse(attempt);
            },
        );

        fastify.post(
            "/:id/submit",
            {
                schema: {
                    tags: [ATTEMPT_TAG],
                    summary: "Submit an attempt and get the scored review",
                    params: attemptParamsSchema,
                    body: submitAttemptBodySchema,
                    response: {
                        200: attemptResultResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const result = await service.submitAttempt(
                    toSubmitAttemptInput(request.params.id, request.body),
                );

                return toAttemptResultResponse(result);
            },
        );

        fastify.get(
            "/:id/result",
            {
                schema: {
                    tags: [ATTEMPT_TAG],
                    summary: "Review a submitted attempt",
                    params: attemptParamsSchema,
                    response: {
                        200: attemptResultResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const result = await service.getAttemptResult(request.params.id);

                return toAttemptResultResponse(result);
            },
        );
    };
