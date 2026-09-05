import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArticle } from "./factories/article.factory.js";
import { createAttempt } from "./factories/attempt.factory.js";
import { createQuiz } from "./factories/quiz.factory.js";
import { PrismaClient } from "@/generated/prisma/client.js";
import {
    createPrismaAttemptRepository,
    createPrismaQuizRepository,
} from "@/modules/quiz/quiz.prisma.repository.js";
import {
    AttemptNotFoundError,
    QuizArticleMissingError,
    QuizNotFoundError,
} from "@/modules/quiz/quiz.errors.js";
import type { NewQuiz } from "@/modules/quiz/quiz.entity.js";

const newQuiz = (articleId: number, title = "AWS Lambda"): NewQuiz => ({
    articleId,
    title,
    topic: "AWS",
    sourceName: "lambda-deep-dive.html",
    questions: [
        {
            position: 0,
            kind: "single",
            prompt: "What causes a cold start?",
            explanation: "A fresh execution environment.",
            options: [
                { text: "A new environment", isCorrect: true },
                { text: "Low memory", isCorrect: false },
            ],
        },
    ],
});

describe("Prisma quiz and attempt repositories", () => {
    let prisma: PrismaClient;
    let quizzes: ReturnType<typeof createPrismaQuizRepository>;
    let attempts: ReturnType<typeof createPrismaAttemptRepository>;

    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        });

        await prisma.$connect();

        quizzes = createPrismaQuizRepository(prisma);
        attempts = createPrismaAttemptRepository(prisma);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("writes a quiz with its questions and options, then reads it back in order", async () => {
        const article = await createArticle({ prisma });
        const created = await quizzes.create(newQuiz(article.id));

        expect(created.questions).toHaveLength(1);
        expect(created.questions[0]?.options.map((option) => option.text)).toEqual([
            "A new environment",
            "Low memory",
        ]);

        await expect(quizzes.findById(created.id)).resolves.toEqual(created);
    });

    it("updates only the title and topic on save", async () => {
        const seeded = await createQuiz({ prisma });
        const quiz = await quizzes.findById(seeded.id);

        if (quiz === null) {
            throw new Error("factory did not produce a readable quiz");
        }

        const saved = await quizzes.save({
            ...quiz,
            title: "Renamed",
            topic: "Serverless",
        });

        expect(saved).toMatchObject({ title: "Renamed", topic: "Serverless" });
        expect(saved.questions).toHaveLength(quiz.questions.length);
    });

    it("translates a save or delete of a missing quiz into a domain error", async () => {
        const seeded = await createQuiz({ prisma });
        const quiz = await quizzes.findById(seeded.id);

        if (quiz === null) {
            throw new Error("factory did not produce a readable quiz");
        }

        await quizzes.remove(quiz.id);

        await expect(quizzes.findById(quiz.id)).resolves.toBeNull();
        await expect(quizzes.remove(quiz.id)).rejects.toThrow(QuizNotFoundError);
        await expect(quizzes.save(quiz)).rejects.toThrow(QuizNotFoundError);
    });

    it("translates a quiz created against a missing article into a domain error", async () => {
        await expect(quizzes.create(newQuiz(999_999))).rejects.toThrow(
            QuizArticleMissingError,
        );
    });

    it("translates a save of a missing attempt into a domain error", async () => {
        const seeded = await createQuiz({ prisma });

        const attempt = await attempts.create({
            quizId: seeded.id,
            currentIndex: 0,
            answers: [],
            startedAt: new Date("2026-03-01T10:00:00.000Z"),
        });

        await prisma.attempt.delete({ where: { id: attempt.id } });

        await expect(attempts.save(attempt)).rejects.toThrow(AttemptNotFoundError);
    });

    it("translates an attempt started on a missing quiz into a domain error", async () => {
        await expect(
            attempts.create({
                quizId: 999_999,
                currentIndex: 0,
                answers: [],
                startedAt: new Date("2026-03-01T10:00:00.000Z"),
            }),
        ).rejects.toThrow(QuizNotFoundError);
    });

    it("pages newest first and by title, resuming after the cursor", async () => {
        const article = await createArticle({ prisma });

        await quizzes.create(newQuiz(article.id, "Alpha"));
        await quizzes.create(newQuiz(article.id, "Beta"));
        const gamma = await quizzes.create(newQuiz(article.id, "Gamma"));

        const newest = await quizzes.list({ limit: 2, sort: "newest" });

        expect(newest.items.map((item) => item.title)).toEqual(["Gamma", "Beta"]);
        expect(newest.nextCursor).not.toBeNull();
        expect(newest.items[0]?.questionCount).toBe(1);

        const rest = await quizzes.list({
            limit: 2,
            sort: "newest",
            cursor: newest.nextCursor ?? undefined,
        });

        expect(rest.items.map((item) => item.title)).toEqual(["Alpha"]);
        expect(rest.nextCursor).toBeNull();

        const byTitle = await quizzes.list({ limit: 2, sort: "title" });

        expect(byTitle.items.map((item) => item.title)).toEqual(["Alpha", "Beta"]);

        const searched = await quizzes.list({
            limit: 10,
            sort: "newest",
            search: "gam",
        });

        expect(searched.items.map((item) => item.id)).toEqual([gamma.id]);
    });

    it("replaces an attempt's answers wholesale on save", async () => {
        const seeded = await createQuiz({ prisma });
        const questionIds = seeded.questions.map((question) => question.id);
        const optionIds = seeded.questions.map(
            (question) => question.options[0]?.id ?? 0,
        );

        const attempt = await attempts.create({
            quizId: seeded.id,
            currentIndex: 0,
            answers: [],
            startedAt: new Date("2026-03-01T10:00:00.000Z"),
        });

        const withAnswers = await attempts.save({
            ...attempt,
            currentIndex: 1,
            answers: questionIds.map((questionId, index) => ({
                questionId,
                selectedOptionIds: [optionIds[index] ?? 0],
            })),
        });

        expect(withAnswers.answers).toHaveLength(questionIds.length);

        const trimmed = await attempts.save({
            ...withAnswers,
            status: "submitted",
            score: 1,
            total: 2,
            submittedAt: new Date("2026-03-01T10:05:00.000Z"),
            answers: [
                {
                    questionId: questionIds[0] ?? 0,
                    selectedOptionIds: [optionIds[0] ?? 0],
                },
            ],
        });

        expect(trimmed.answers).toHaveLength(1);
        expect(trimmed).toMatchObject({ status: "submitted", score: 1, total: 2 });

        await expect(attempts.findById(attempt.id)).resolves.toEqual(trimmed);
    });

    it("returns one latest attempt per quiz and nothing for no quizzes", async () => {
        const first = await createQuiz({ prisma });
        const second = await createQuiz({ prisma });

        await createAttempt({ prisma, quizId: first.id });
        const newest = await createAttempt({ prisma, quizId: first.id });
        const other = await createAttempt({ prisma, quizId: second.id });

        const latest = await attempts.findLatestForQuizzes([first.id, second.id]);

        expect(latest.map((attempt) => attempt.id).sort()).toEqual(
            [newest.id, other.id].sort(),
        );

        await expect(attempts.findLatestForQuizzes([])).resolves.toEqual([]);
    });

    it("takes a quiz's questions and attempts down with it", async () => {
        const seeded = await createQuiz({ prisma });

        await createAttempt({ prisma, quizId: seeded.id });
        await quizzes.remove(seeded.id);

        await expect(
            prisma.question.count({ where: { quizId: seeded.id } }),
        ).resolves.toBe(0);
        await expect(
            prisma.attempt.count({ where: { quizId: seeded.id } }),
        ).resolves.toBe(0);
    });
});
