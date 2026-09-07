import { describe, expect, it } from "vitest";
import { fixedClock } from "../helpers/fixed-clock.js";
import {
    createBrokenGenerationLock,
    createInMemoryGenerationLock,
} from "../helpers/in-memory-generation-lock.js";
import { createInMemoryGenerationRepository } from "../helpers/in-memory-generation-repository.js";
import {
    cannedAttempt,
    cannedCandidate,
    createSequencedQuizGenerator,
    createStubQuizGenerator,
} from "../helpers/stub-quiz-generator.js";
import { countWords } from "@/lib/article-text.js";
import { ArticleSourceMissingError } from "@/modules/article/article.errors.js";
import { planQuestionRange } from "@/modules/generation/generation.entity.js";
import { createGenerationService } from "@/modules/generation/generation.service.js";
import {
    GenerationInProgressError,
    GenerationLockUnavailableError,
    GenerationRefusedError,
    GenerationRequestRejectedError,
} from "@/modules/generation/generation.errors.js";
import type { StubQuizGenerator } from "../helpers/stub-quiz-generator.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { QuestionBounds } from "@/modules/generation/generation.entity.js";
import type { GenerationLock } from "@/modules/generation/ports/lock.port.js";
import type { GenerationRepository } from "@/modules/generation/ports/repository.port.js";
import type { GenerationService } from "@/modules/generation/ports/service.port.js";
import type { CreateQuizInput } from "@/modules/quiz/dto/quiz.dto.js";
import type {
    CreatedQuizRef,
    QuizPublicApi,
} from "@/modules/quiz/ports/public-api.port.js";

const NOW = "2026-03-01T10:00:00.000Z";

const ARTICLE_HTML = `<html><body>
<h1>Lambda cold starts</h1>
<p>A cold start happens when AWS Lambda has to initialize a fresh execution environment before it can run your handler. The platform downloads the deployment package, starts the runtime, and runs any initialization code that sits outside the handler.</p>
<p>Warm environments skip all of that, which is why a steady stream of invocations feels faster than a burst of traffic after a long idle period.</p>
</body></html>`;

const SHORT_ARTICLE_HTML = "<p>Too short to quiz.</p>";

const ANY_COUNT: QuestionBounds = { min: 1, max: 30 };

const articles = (overrides: Partial<ArticlePublicApi> = {}): ArticlePublicApi => ({
    getArticle: async (articleId) => ({ id: articleId, filename: "lambda.html" }),
    readArticleSource: async (articleId) => ({
        id: articleId,
        filename: "lambda.html",
        html: ARTICLE_HTML,
    }),
    ...overrides,
});

const shortArticles = (): ArticlePublicApi =>
    articles({
        readArticleSource: async (articleId) => ({
            id: articleId,
            filename: "lambda.html",
            html: SHORT_ARTICLE_HTML,
        }),
    });

const throwingGenerator = (error: Error): StubQuizGenerator =>
    createStubQuizGenerator(async () => {
        throw error;
    });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let nextQuizId = 1;

const quizzes = (
    overrides: Partial<QuizPublicApi> = {},
): QuizPublicApi & { createdQuizzes: () => CreateQuizInput[] } => {
    const created: CreateQuizInput[] = [];

    return {
        createdQuizzes: () => [...created],
        listTopics: async () => [],
        createQuiz: async (input): Promise<CreatedQuizRef> => {
            created.push(input);

            return { id: nextQuizId++, title: input.title, topic: input.topic };
        },
        ...overrides,
    };
};

const waitUntilTerminal = async (service: GenerationService, id: number) => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const generation = await service.getGeneration(id);

        if (generation.status === "succeeded" || generation.status === "failed") {
            return generation;
        }

        await sleep(5);
    }

    throw new Error(`generation ${id} never settled`);
};

let nextToken = 1;

const testTokenGenerator = { generate: () => `test-token-${nextToken++}` };

const buildService = (
    overrides: {
        lock?: GenerationLock;
        generator?: StubQuizGenerator;
        articles?: ArticlePublicApi;
        quizzes?: ReturnType<typeof quizzes>;
        lockRenewSeconds?: number;
        questionBounds?: QuestionBounds;
        maxCorrections?: number;
    } = {},
) => {
    const repository = createInMemoryGenerationRepository();
    const lock = overrides.lock ?? createInMemoryGenerationLock();
    const generator = overrides.generator ?? createStubQuizGenerator();
    const articleApi = overrides.articles ?? articles();
    const quizApi = overrides.quizzes ?? quizzes();
    const clock = fixedClock(NOW);

    const service = createGenerationService(
        {
            repository,
            lock,
            generator,
            articles: articleApi,
            quizzes: quizApi,
            clock,
            tokens: testTokenGenerator,
        },
        {
            lockRenewSeconds: overrides.lockRenewSeconds ?? 30,
            questionBounds: overrides.questionBounds ?? ANY_COUNT,
            maxCorrections: overrides.maxCorrections ?? 1,
        },
    );

    return {
        repository,
        lock,
        generator,
        articles: articleApi,
        quizzes: quizApi,
        service,
    };
};

describe("generation service — starting", () => {
    it("returns a pending job immediately and lets it settle in the background", async () => {
        const { service } = buildService();

        const started = await service.startGeneration({ articleId: 1 });

        expect(started.status).toBe("pending");
        expect(started.quizId).toBeNull();

        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("succeeded");
        expect(settled.quizId).not.toBeNull();
    });

    it("refuses a second start while a generation is already running (409)", async () => {
        const lock = createInMemoryGenerationLock();

        await lock.acquire("someone-elses-token");

        const { service } = buildService({ lock });

        await expect(service.startGeneration({ articleId: 1 })).rejects.toThrow(
            GenerationInProgressError,
        );
    });

    it("reports 503, never a silent proceed, when the lock store is unreachable", async () => {
        const { service } = buildService({ lock: createBrokenGenerationLock() });

        await expect(service.startGeneration({ articleId: 1 })).rejects.toThrow(
            GenerationLockUnavailableError,
        );
    });

    it("always releases the lock once the background job settles, on success", async () => {
        const lock = createInMemoryGenerationLock();
        const { service } = buildService({ lock });

        const started = await service.startGeneration({ articleId: 1 });

        await waitUntilTerminal(service, started.id);

        await expect(lock.holder()).resolves.toBeNull();
    });

    it("always releases the lock once the background job settles, on failure", async () => {
        const lock = createInMemoryGenerationLock();
        const { service } = buildService({
            lock,
            generator: throwingGenerator(new Error("boom")),
        });

        const started = await service.startGeneration({ articleId: 1 });

        await waitUntilTerminal(service, started.id);

        await expect(lock.holder()).resolves.toBeNull();
    });

    it("releases the lock rather than leaking it when the job row cannot be created", async () => {
        const lock = createInMemoryGenerationLock();
        const repository: GenerationRepository = {
            ...createInMemoryGenerationRepository(),
            create: async () => {
                throw new Error("db unavailable");
            },
        };

        const service = createGenerationService(
            {
                repository,
                lock,
                generator: createStubQuizGenerator(),
                articles: articles(),
                quizzes: quizzes(),
                clock: fixedClock(NOW),
                tokens: testTokenGenerator,
            },
            { lockRenewSeconds: 30, questionBounds: ANY_COUNT, maxCorrections: 1 },
        );

        await expect(service.startGeneration({ articleId: 1 })).rejects.toThrow(
            "db unavailable",
        );
        await expect(lock.holder()).resolves.toBeNull();
    });
});

describe("generation service — preparing the article", () => {
    it("hands the generator the extracted text and the planned range, never the HTML", async () => {
        const generator = createStubQuizGenerator();
        const { service } = buildService({ generator });

        const started = await service.startGeneration({ articleId: 1 });

        await waitUntilTerminal(service, started.id);

        const [call] = generator.calls();

        if (call === undefined) {
            throw new Error("expected the generator to be called once");
        }

        expect(call.filename).toBe("lambda.html");
        expect(call.articleText).toContain("A cold start happens when AWS Lambda");
        expect(call.articleText).not.toContain("<p>");
        expect(call.questionRange).toEqual(
            planQuestionRange(countWords(call.articleText), ANY_COUNT),
        );
    });

    it("records EMPTY_ARTICLE_TEXT without calling the generator when there is too little text", async () => {
        const generator = createStubQuizGenerator();
        const { service } = buildService({ generator, articles: shortArticles() });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("EMPTY_ARTICLE_TEXT");
        expect(generator.calls()).toHaveLength(0);
    });
});

describe("generation service — validating and correcting the candidate", () => {
    const unusable = cannedCandidate({
        title: "   ",
        questions: [
            {
                kind: "single",
                prompt: "Pick one",
                explanation: "x",
                options: [
                    { text: "A", isCorrect: true },
                    { text: "B", isCorrect: true },
                ],
            },
        ],
    });

    it("sends every reason back once and accepts the corrected candidate, billing both turns", async () => {
        const generator = createSequencedQuizGenerator(unusable, cannedCandidate());
        const { service, repository } = buildService({ generator });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("succeeded");
        expect(generator.corrections()).toEqual([
            [
                "the title must not be empty",
                "question 1 is single-select and needs exactly one correct option, not 2",
            ],
        ]);
        expect(repository.rows()[0]).toMatchObject({
            inputTokens: 200,
            outputTokens: 100,
            cacheReadTokens: 0,
        });
    });

    it("fails with GENERATION_INVALID_OUTPUT naming the reasons once the correction budget is spent", async () => {
        const generator = createSequencedQuizGenerator(unusable, unusable);
        const { service, quizzes: quizApi } = buildService({ generator });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_INVALID_OUTPUT");
        expect(settled.failureMessage).toContain("the title must not be empty");
        expect(generator.corrections()).toHaveLength(1);
        expect(quizApi.createdQuizzes()).toHaveLength(0);
    });

    it("spends no correction turn when the budget is zero", async () => {
        const generator = createSequencedQuizGenerator(unusable, cannedCandidate());
        const { service } = buildService({ generator, maxCorrections: 0 });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_INVALID_OUTPUT");
        expect(generator.corrections()).toEqual([]);
    });

    it("holds the candidate to the question range planned for this article", async () => {
        const twoQuestions = cannedCandidate({
            questions: [
                ...cannedCandidate().questions,
                {
                    kind: "single",
                    prompt: "What keeps an environment warm?",
                    explanation: "Steady traffic.",
                    options: [
                        { text: "Steady traffic", isCorrect: true },
                        { text: "A larger package", isCorrect: false },
                    ],
                },
            ],
        });
        const generator = createSequencedQuizGenerator(twoQuestions, twoQuestions);
        const { service } = buildService({
            generator,
            questionBounds: { min: 1, max: 1 },
        });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureMessage).toContain("exactly 1 question, not 2");
    });
});

describe("generation service — topic reconciliation (D7)", () => {
    it("snaps a model-picked topic to the stored casing of an existing one", async () => {
        const { service, quizzes: quizApi } = buildService({
            quizzes: quizzes({ listTopics: async () => ["AWS Lambda"] }),
            generator: createStubQuizGenerator(async () =>
                cannedAttempt(cannedCandidate({ topic: "aws lambda" })),
            ),
        });

        const started = await service.startGeneration({ articleId: 1 });

        await waitUntilTerminal(service, started.id);

        expect(quizApi.createdQuizzes()).toEqual([
            expect.objectContaining({ topic: "AWS Lambda" }),
        ]);
    });

    it("mints a new normalised topic when nothing in the vocabulary matches", async () => {
        const { service, quizzes: quizApi } = buildService({
            quizzes: quizzes({ listTopics: async () => ["Postgres"] }),
            generator: createStubQuizGenerator(async () =>
                cannedAttempt(cannedCandidate({ topic: "  Terraform   Modules  " })),
            ),
        });

        const started = await service.startGeneration({ articleId: 1 });

        await waitUntilTerminal(service, started.id);

        expect(quizApi.createdQuizzes()).toEqual([
            expect.objectContaining({ topic: "Terraform Modules" }),
        ]);
    });
});

describe("generation service — failure recording", () => {
    it("records a named failure code from a recognised generation error", async () => {
        const { service } = buildService({
            generator: throwingGenerator(new GenerationRefusedError()),
        });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_REFUSED");
    });

    it("records GENERATION_REQUEST_REJECTED with the vendor's detail", async () => {
        const { service } = buildService({
            generator: throwingGenerator(
                new GenerationRequestRejectedError("400 effort must be one of ..."),
            ),
        });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_REQUEST_REJECTED");
        expect(settled.failureMessage).toContain("400 effort must be one of");
    });

    it("falls back to GENERATION_INVALID_OUTPUT for an unrecognised error", async () => {
        const { service } = buildService({
            generator: throwingGenerator(new Error("something odd")),
        });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("GENERATION_INVALID_OUTPUT");
        expect(settled.failureMessage).not.toBeNull();
    });

    it("records ARTICLE_SOURCE_MISSING when the article file is gone", async () => {
        const { service } = buildService({
            articles: articles({
                readArticleSource: async () => {
                    throw new ArticleSourceMissingError();
                },
            }),
        });

        const started = await service.startGeneration({ articleId: 1 });
        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("ARTICLE_SOURCE_MISSING");
    });
});

describe("generation service — abort on lost lock", () => {
    it("aborts and records LOCK_LOST rather than writing a quiz it no longer holds the lock for", async () => {
        const lock = createInMemoryGenerationLock();
        const slowGenerator = createStubQuizGenerator(async () => {
            await sleep(20);

            return cannedAttempt();
        });

        const { service, quizzes: quizApi } = buildService({
            lock,
            generator: slowGenerator,
            lockRenewSeconds: 0.001,
        });

        const started = await service.startGeneration({ articleId: 1 });

        const holderToken = lock.holderToken();

        if (holderToken === null) {
            throw new Error("expected the lock to be held by the started job");
        }

        await lock.release(holderToken);

        const settled = await waitUntilTerminal(service, started.id);

        expect(settled.status).toBe("failed");
        expect(settled.failureCode).toBe("LOCK_LOST");
        expect(quizApi.createdQuizzes()).toHaveLength(0);
    });
});

describe("generation service — boot sweep", () => {
    const buildBootService = (
        repository: ReturnType<typeof createInMemoryGenerationRepository>,
        lock: ReturnType<typeof createInMemoryGenerationLock>,
    ) =>
        createGenerationService(
            {
                repository,
                lock,
                generator: createStubQuizGenerator(),
                articles: articles(),
                quizzes: quizzes(),
                clock: fixedClock(NOW),
                tokens: testTokenGenerator,
            },
            { lockRenewSeconds: 30, questionBounds: ANY_COUNT, maxCorrections: 1 },
        );

    it("leaves a row untouched when its token still matches the live lock holder", async () => {
        const repository = createInMemoryGenerationRepository();
        const lock = createInMemoryGenerationLock();

        const stillLive = await repository.create({
            articleId: 1,
            lockToken: "live-token",
        });

        await lock.acquire(stillLive.lockToken);

        const service = buildBootService(repository, lock);

        await service.reconcileOnBoot();

        await expect(service.getGeneration(stillLive.id)).resolves.toMatchObject({
            status: "pending",
        });
        await expect(lock.holder()).resolves.toBe("live-token");
    });

    it("fails an orphaned row whose token does not match the current holder (lock already free)", async () => {
        const repository = createInMemoryGenerationRepository();
        const lock = createInMemoryGenerationLock();

        const orphan = await repository.create({
            articleId: 1,
            lockToken: "dead-token",
        });

        const service = buildBootService(repository, lock);

        await service.reconcileOnBoot();

        await expect(service.getGeneration(orphan.id)).resolves.toMatchObject({
            status: "failed",
            failureCode: "LOCK_LOST",
        });
    });

    it("fails an orphaned row without disturbing a different, newer job's live lock", async () => {
        const repository = createInMemoryGenerationRepository();
        const lock = createInMemoryGenerationLock();

        const orphan = await repository.create({
            articleId: 1,
            lockToken: "dead-token",
        });

        await lock.acquire("newer-token");

        const service = buildBootService(repository, lock);

        await service.reconcileOnBoot();

        await expect(service.getGeneration(orphan.id)).resolves.toMatchObject({
            status: "failed",
            failureCode: "LOCK_LOST",
        });
        await expect(lock.holder()).resolves.toBe("newer-token");
    });

    it("does nothing when there is nothing unfinished", async () => {
        const { service, lock } = buildService();

        await expect(service.reconcileOnBoot()).resolves.toBeUndefined();
        await expect(lock.holder()).resolves.toBeNull();
    });
});
