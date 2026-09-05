import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryAttemptRepository } from "../helpers/in-memory-attempt-repository.js";
import {
    createBrokenQuizCache,
    createInMemoryQuizCache,
} from "../helpers/in-memory-quiz-cache.js";
import { createInMemoryQuizRepository } from "../helpers/in-memory-quiz-repository.js";
import { fixedClock } from "../helpers/fixed-clock.js";
import { createQuizService } from "@/modules/quiz/quiz.service.js";
import {
    AttemptAlreadySubmittedError,
    AttemptNotFoundError,
    AttemptNotSubmittedError,
    QuizNotFoundError,
} from "@/modules/quiz/quiz.errors.js";
import type { ArticlePublicApi } from "@/modules/article/article.ports.js";
import type {
    CreateQuizInput,
    QuizCache,
    QuizRepository,
} from "@/modules/quiz/quiz.ports.js";

const NOW = "2026-03-01T10:00:00.000Z";

const articles: ArticlePublicApi = {
    getArticle: async (articleId) => ({
        id: articleId,
        filename: "lambda-deep-dive.html",
    }),
};

const quizInput = (overrides: Partial<CreateQuizInput> = {}): CreateQuizInput => ({
    articleId: 7,
    title: "AWS Lambda Cold Starts",
    topic: "AWS",
    questions: [
        {
            kind: "single",
            prompt: "What causes a cold start?",
            explanation: "A fresh execution environment.",
            options: [
                { text: "A new environment", isCorrect: true },
                { text: "Low memory", isCorrect: false },
            ],
        },
        {
            kind: "multi",
            prompt: "What shortens one?",
            explanation: "Warm environments and a smaller init.",
            options: [
                { text: "Provisioned concurrency", isCorrect: true },
                { text: "Smaller package", isCorrect: true },
                { text: "Clients in the handler", isCorrect: false },
            ],
        },
    ],
    ...overrides,
});

const CORRECT_OPTION_INDEXES = [[0], [0, 1]];

const countingRepository = (repository: QuizRepository) => {
    let findByIdCalls = 0;

    return {
        findByIdCalls: () => findByIdCalls,
        repository: {
            ...repository,
            findById: async (id: number) => {
                findByIdCalls++;

                return repository.findById(id);
            },
        },
    };
};

const buildService = (cache: QuizCache = createInMemoryQuizCache()) => {
    const clock = fixedClock(NOW);
    const repository = createInMemoryQuizRepository(clock);
    const attempts = createInMemoryAttemptRepository();

    return {
        repository,
        attempts,
        cache,
        service: createQuizService({
            repository,
            attempts,
            cache,
            articles,
            clock,
        }),
    };
};

describe("quiz use cases", () => {
    let context: ReturnType<typeof buildService>;

    beforeEach(() => {
        context = buildService();
    });

    it("stamps the quiz with the source article's filename", async () => {
        const quiz = await context.service.createQuiz(quizInput());

        expect(quiz.sourceName).toBe("lambda-deep-dive.html");
        expect(quiz.questions).toHaveLength(2);
    });

    it("never publishes the answer key on the take shape", async () => {
        const created = await context.service.createQuiz(quizInput());
        const quiz = await context.service.getQuiz(created.id);

        const options = quiz.questions.flatMap((question) => question.options);

        expect(options.every((option) => !("isCorrect" in option))).toBe(true);
    });

    it("renames a quiz and invalidates the cached copy", async () => {
        const cache = createInMemoryQuizCache();
        const local = buildService(cache);

        const created = await local.service.createQuiz(quizInput());

        await local.service.getQuiz(created.id);
        expect(cache.keys()).toEqual([created.id]);

        await local.service.updateQuiz({ id: created.id, topic: "Serverless" });
        expect(cache.keys()).toEqual([]);

        await expect(local.service.getQuiz(created.id)).resolves.toMatchObject({
            topic: "Serverless",
        });
    });

    it("deletes a quiz and forgets it", async () => {
        const cache = createInMemoryQuizCache();
        const local = buildService(cache);

        const created = await local.service.createQuiz(quizInput());

        await local.service.getQuiz(created.id);
        await local.service.deleteQuiz(created.id);

        expect(cache.keys()).toEqual([]);
        await expect(local.service.getQuiz(created.id)).rejects.toThrow(
            QuizNotFoundError,
        );
    });

    it("reports a missing quiz rather than a null", async () => {
        await expect(context.service.getQuiz(404)).rejects.toThrow(
            QuizNotFoundError,
        );
        await expect(context.service.startAttempt({ quizId: 404 })).rejects.toThrow(
            QuizNotFoundError,
        );
    });
});

describe("quiz list", () => {
    let context: ReturnType<typeof buildService>;

    beforeEach(() => {
        context = buildService();
    });

    it("reports every quiz as not started until an attempt exists", async () => {
        await context.service.createQuiz(quizInput());

        const page = await context.service.listQuizzes({
            limit: 10,
            sort: "newest",
        });

        expect(page.items[0]).toMatchObject({
            status: "new",
            attemptId: null,
            score: null,
            questionCount: 2,
        });
    });

    it("shows the latest attempt's progress against its quiz", async () => {
        const quiz = await context.service.createQuiz(quizInput());
        const attempt = await context.service.startAttempt({ quizId: quiz.id });

        await context.service.saveProgress({
            id: attempt.id,
            currentIndex: 1,
            answers: [
                {
                    questionId: quiz.questions[0]?.id ?? 0,
                    selectedOptionIds: [quiz.questions[0]?.options[0]?.id ?? 0],
                },
            ],
        });

        const page = await context.service.listQuizzes({
            limit: 10,
            sort: "newest",
        });

        expect(page.items[0]).toMatchObject({
            status: "draft",
            attemptId: attempt.id,
            currentIndex: 1,
        });
    });

    it("prefers the newest attempt when a quiz was retaken", async () => {
        const quiz = await context.service.createQuiz(quizInput());
        const first = await context.service.startAttempt({ quizId: quiz.id });

        await context.service.submitAttempt({ id: first.id, answers: [] });

        const retake = await context.service.startAttempt({ quizId: quiz.id });

        const page = await context.service.listQuizzes({
            limit: 10,
            sort: "newest",
        });

        expect(page.items[0]).toMatchObject({
            status: "draft",
            attemptId: retake.id,
        });
    });

    it("filters by title or topic and pages with a cursor", async () => {
        await context.service.createQuiz(quizInput({ title: "Alpha" }));
        await context.service.createQuiz(quizInput({ title: "Beta" }));
        await context.service.createQuiz(
            quizInput({ title: "Gamma", topic: "Databases" }),
        );

        const searched = await context.service.listQuizzes({
            limit: 10,
            sort: "newest",
            search: "databases",
        });

        expect(searched.items.map((item) => item.title)).toEqual(["Gamma"]);

        const firstPage = await context.service.listQuizzes({
            limit: 2,
            sort: "title",
        });

        expect(firstPage.items.map((item) => item.title)).toEqual(["Alpha", "Beta"]);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await context.service.listQuizzes({
            limit: 2,
            sort: "title",
            cursor: firstPage.nextCursor ?? undefined,
        });

        expect(secondPage.items.map((item) => item.title)).toEqual(["Gamma"]);
        expect(secondPage.nextCursor).toBeNull();
    });
});

describe("attempt use cases", () => {
    let context: ReturnType<typeof buildService>;

    beforeEach(() => {
        context = buildService();
    });

    const correctAnswers = async () => {
        const quiz = await context.service.createQuiz(quizInput());
        const attempt = await context.service.startAttempt({ quizId: quiz.id });

        const answers = quiz.questions.map((question, index) => ({
            questionId: question.id,
            selectedOptionIds: (CORRECT_OPTION_INDEXES[index] ?? []).map(
                (optionIndex) => question.options[optionIndex]?.id ?? 0,
            ),
        }));

        return { quiz, attempt, answers };
    };

    it("scores a submission and returns the review", async () => {
        const { attempt, answers } = await correctAnswers();

        const result = await context.service.submitAttempt({
            id: attempt.id,
            answers,
        });

        expect(result).toMatchObject({ score: 2, total: 2 });
        expect(result.review).toHaveLength(2);
        expect(result.review[0]?.correctOptionIds).toHaveLength(1);
        expect(result.review[0]?.explanation).toBe("A fresh execution environment.");
    });

    it("keeps the review readable after the fact", async () => {
        const { attempt, answers } = await correctAnswers();

        await context.service.submitAttempt({ id: attempt.id, answers });

        await expect(
            context.service.getAttemptResult(attempt.id),
        ).resolves.toMatchObject({ score: 2, total: 2 });
    });

    it("refuses to review an attempt still in progress", async () => {
        const quiz = await context.service.createQuiz(quizInput());
        const attempt = await context.service.startAttempt({ quizId: quiz.id });

        await expect(context.service.getAttemptResult(attempt.id)).rejects.toThrow(
            AttemptNotSubmittedError,
        );
    });

    it("refuses to submit an attempt twice", async () => {
        const { attempt, answers } = await correctAnswers();

        await context.service.submitAttempt({ id: attempt.id, answers });

        await expect(
            context.service.submitAttempt({ id: attempt.id, answers }),
        ).rejects.toThrow(AttemptAlreadySubmittedError);
    });

    it("reports a missing attempt rather than a null", async () => {
        await expect(context.service.getAttempt(404)).rejects.toThrow(
            AttemptNotFoundError,
        );
    });
});

describe("caching policy", () => {
    it("serves a repeated read from the cache without touching the repository", async () => {
        const cache = createInMemoryQuizCache();
        const clock = fixedClock(NOW);
        const counted = countingRepository(createInMemoryQuizRepository(clock));

        const service = createQuizService({
            repository: counted.repository,
            attempts: createInMemoryAttemptRepository(),
            cache,
            articles,
            clock,
        });

        const created = await service.createQuiz(quizInput());

        await service.getQuiz(created.id);
        await service.getQuiz(created.id);

        expect(cache.reads()).toBe(2);
        expect(counted.findByIdCalls()).toBe(1);
        expect(cache.keys()).toEqual([created.id]);
    });

    it("never caches a list", async () => {
        const cache = createInMemoryQuizCache();
        const context = buildService(cache);

        await context.service.createQuiz(quizInput());

        await context.service.listQuizzes({ limit: 10, sort: "newest" });
        await context.service.listQuizzes({ limit: 10, sort: "newest" });

        expect(cache.keys()).toEqual([]);
    });

    it("reads the source of truth for commands, never a snapshot", async () => {
        const cache = createInMemoryQuizCache();
        const context = buildService(cache);

        const created = await context.service.createQuiz(quizInput());

        await context.service.getQuiz(created.id);

        const stale = context.repository.rows()[0];

        if (stale) {
            await cache.write({ ...stale, title: "Stale title" });
        }

        const renamed = await context.service.updateQuiz({
            id: created.id,
            topic: "Serverless",
        });

        expect(renamed.title).toBe("AWS Lambda Cold Starts");
    });

    it("lets a broken cache surface rather than swallowing it in the service", async () => {
        const context = buildService(createBrokenQuizCache());

        const created = await context.repository.create({
            articleId: 7,
            title: "AWS Lambda Cold Starts",
            topic: "AWS",
            sourceName: "lambda-deep-dive.html",
            questions: [],
        });

        await expect(context.service.getQuiz(created.id)).rejects.toThrow(
            "cache unavailable",
        );
    });
});
