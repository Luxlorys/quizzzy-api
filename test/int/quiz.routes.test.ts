import { beforeEach, describe, expect, it } from "vitest";
import { createArticle } from "./factories/article.factory.js";
import { buildTestApp } from "./helpers/build-test-app.js";
import type { FastifyInstance } from "fastify";

type QuizResponse = {
    id: number;
    title: string;
    topic: string;
    sourceName: string;
    questions: {
        id: number;
        type: "single" | "multi";
        question: string;
        options: { id: number; text: string }[];
    }[];
};

type AttemptResponse = {
    id: number;
    quizId: number;
    status: "draft" | "submitted";
    currentIndex: number;
};

type ResultResponse = {
    score: number;
    total: number;
    review: {
        questionId: number;
        explanation: string;
        correctOptionIds: number[];
        isCorrect: boolean;
    }[];
};

const quizBody = (articleId: number, title = "AWS Lambda Cold Starts") => ({
    articleId,
    title,
    topic: "AWS",
    questions: [
        {
            type: "single" as const,
            question: "What causes a cold start?",
            explanation: "A fresh execution environment.",
            options: [
                { text: "A new environment", isCorrect: true },
                { text: "Low memory", isCorrect: false },
            ],
        },
        {
            type: "multi" as const,
            question: "What shortens one?",
            explanation: "Warm environments and a smaller init.",
            options: [
                { text: "Provisioned concurrency", isCorrect: true },
                { text: "Smaller package", isCorrect: true },
                { text: "Clients in the handler", isCorrect: false },
            ],
        },
    ],
});

describe("quiz and attempt routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    const seedQuiz = async (title?: string) => {
        const article = await createArticle({ prisma: app.prisma });

        const created = await app.inject({
            method: "POST",
            url: "/api/quizzes",
            payload: quizBody(article.id, title),
        });

        expect(created.statusCode).toBe(201);

        return { article, quiz: created.json<QuizResponse>() };
    };

    it("creates a quiz stamped with its article and hides the answer key", async () => {
        const { article, quiz } = await seedQuiz();

        expect(quiz.sourceName).toBe(article.filename);
        expect(quiz.questions).toHaveLength(2);
        expect(quiz.questions[0]?.options[0]).toEqual({
            id: expect.any(Number) as number,
            text: "A new environment",
        });

        const fetched = await app.inject({
            method: "GET",
            url: `/api/quizzes/${quiz.id}`,
        });

        expect(fetched.statusCode).toBe(200);
        expect(JSON.stringify(fetched.json())).not.toContain("isCorrect");
    });

    it("refuses a quiz whose article does not exist", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/quizzes",
            payload: quizBody(999_999),
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: "Article not found." });
    });

    it("refuses a single-select question with two correct options", async () => {
        const article = await createArticle({ prisma: app.prisma });
        const body = quizBody(article.id);

        const response = await app.inject({
            method: "POST",
            url: "/api/quizzes",
            payload: {
                ...body,
                questions: [
                    {
                        ...body.questions[0],
                        options: [
                            { text: "A new environment", isCorrect: true },
                            { text: "Low memory", isCorrect: true },
                        ],
                    },
                ],
            },
        });

        expect(response.statusCode).toBe(422);
    });

    it("walks the library, a draft, a submission and a retake", async () => {
        const { quiz } = await seedQuiz();

        const untouched = await app.inject({ method: "GET", url: "/api/quizzes" });

        expect(untouched.statusCode).toBe(200);
        expect(
            untouched.json<{ items: { status: string }[] }>().items[0],
        ).toMatchObject({ status: "new", attemptId: null, questionCount: 2 });

        const started = await app.inject({
            method: "POST",
            url: "/api/attempts",
            payload: { quizId: quiz.id },
        });

        expect(started.statusCode).toBe(201);

        const attempt = started.json<AttemptResponse>();

        const singleQuestion = quiz.questions[0];
        const multiQuestion = quiz.questions[1];

        if (!singleQuestion || !multiQuestion) {
            throw new Error("the seeded quiz is missing its questions");
        }

        const saved = await app.inject({
            method: "PATCH",
            url: `/api/attempts/${attempt.id}`,
            payload: {
                currentIndex: 1,
                answers: [
                    {
                        questionId: singleQuestion.id,
                        selectedOptionIds: [singleQuestion.options[0]?.id],
                    },
                ],
            },
        });

        expect(saved.statusCode).toBe(200);
        expect(saved.json<AttemptResponse>()).toMatchObject({
            status: "draft",
            currentIndex: 1,
        });

        const drafted = await app.inject({ method: "GET", url: "/api/quizzes" });

        expect(
            drafted.json<{ items: { status: string; attemptId: number }[] }>()
                .items[0],
        ).toMatchObject({ status: "draft", attemptId: attempt.id });

        const submitted = await app.inject({
            method: "POST",
            url: `/api/attempts/${attempt.id}/submit`,
            payload: {
                answers: [
                    {
                        questionId: singleQuestion.id,
                        selectedOptionIds: [singleQuestion.options[0]?.id],
                    },
                    {
                        questionId: multiQuestion.id,
                        selectedOptionIds: [multiQuestion.options[0]?.id],
                    },
                ],
            },
        });

        expect(submitted.statusCode).toBe(200);

        const result = submitted.json<ResultResponse>();

        expect(result).toMatchObject({ score: 1, total: 2 });
        expect(result.review[1]).toMatchObject({ isCorrect: false });
        expect(result.review[1]?.correctOptionIds).toHaveLength(2);
        expect(result.review[1]?.explanation).toBe(
            "Warm environments and a smaller init.",
        );

        const reviewed = await app.inject({
            method: "GET",
            url: `/api/attempts/${attempt.id}/result`,
        });

        expect(reviewed.statusCode).toBe(200);
        expect(reviewed.json<ResultResponse>().score).toBe(1);

        const resubmitted = await app.inject({
            method: "POST",
            url: `/api/attempts/${attempt.id}/submit`,
            payload: { answers: [] },
        });

        expect(resubmitted.statusCode).toBe(409);

        const done = await app.inject({ method: "GET", url: "/api/quizzes" });

        expect(
            done.json<{ items: { status: string; score: number }[] }>().items[0],
        ).toMatchObject({ status: "done", score: 1, total: 2 });

        const retake = await app.inject({
            method: "POST",
            url: "/api/attempts",
            payload: { quizId: quiz.id },
        });

        expect(retake.statusCode).toBe(201);
        expect(retake.json<AttemptResponse>().currentIndex).toBe(0);

        const afterRetake = await app.inject({ method: "GET", url: "/api/quizzes" });

        expect(
            afterRetake.json<{ items: { status: string }[] }>().items[0],
        ).toMatchObject({ status: "draft" });
    });

    it("refuses to review an attempt that is still a draft", async () => {
        const { quiz } = await seedQuiz();

        const started = await app.inject({
            method: "POST",
            url: "/api/attempts",
            payload: { quizId: quiz.id },
        });

        const attempt = started.json<AttemptResponse>();

        const response = await app.inject({
            method: "GET",
            url: `/api/attempts/${attempt.id}/result`,
        });

        expect(response.statusCode).toBe(409);
    });

    it("refuses an answer that names another question's option", async () => {
        const { quiz } = await seedQuiz();

        const started = await app.inject({
            method: "POST",
            url: "/api/attempts",
            payload: { quizId: quiz.id },
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/attempts/${started.json<AttemptResponse>().id}`,
            payload: {
                currentIndex: 0,
                answers: [
                    {
                        questionId: quiz.questions[0]?.id,
                        selectedOptionIds: [quiz.questions[1]?.options[0]?.id],
                    },
                ],
            },
        });

        expect(response.statusCode).toBe(422);
    });

    it("renames a quiz, searches by topic and deletes it with its attempts", async () => {
        const { quiz } = await seedQuiz();

        const renamed = await app.inject({
            method: "PATCH",
            url: `/api/quizzes/${quiz.id}`,
            payload: { topic: "Serverless" },
        });

        expect(renamed.statusCode).toBe(200);
        expect(renamed.json<QuizResponse>()).toMatchObject({
            title: quiz.title,
            topic: "Serverless",
        });

        const searched = await app.inject({
            method: "GET",
            url: "/api/quizzes?search=serverless",
        });

        expect(searched.json<{ items: { id: number }[] }>().items).toHaveLength(1);

        await app.inject({
            method: "POST",
            url: "/api/attempts",
            payload: { quizId: quiz.id },
        });

        const deleted = await app.inject({
            method: "DELETE",
            url: `/api/quizzes/${quiz.id}`,
        });

        expect(deleted.statusCode).toBe(204);

        const gone = await app.inject({
            method: "GET",
            url: `/api/quizzes/${quiz.id}`,
        });

        expect(gone.statusCode).toBe(404);
        await expect(app.prisma.attempt.count()).resolves.toBe(0);
    });

    it("pages the library newest first", async () => {
        await seedQuiz("Alpha");
        await seedQuiz("Beta");

        const firstPage = await app.inject({
            method: "GET",
            url: "/api/quizzes?limit=1",
        });

        const page = firstPage.json<{
            items: { title: string }[];
            nextCursor: number | null;
        }>();

        expect(page.items.map((item) => item.title)).toEqual(["Beta"]);
        expect(page.nextCursor).not.toBeNull();

        const secondPage = await app.inject({
            method: "GET",
            url: `/api/quizzes?limit=1&cursor=${page.nextCursor ?? 0}`,
        });

        expect(
            secondPage
                .json<{ items: { title: string }[] }>()
                .items.map((item) => item.title),
        ).toEqual(["Alpha"]);
    });
});
