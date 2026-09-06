import { describe, expect, it } from "vitest";
import {
    createBrokenGenerationLock,
    createInMemoryGenerationLock,
} from "../helpers/in-memory-generation-lock.js";
import { createInMemoryGenerationRepository } from "../helpers/in-memory-generation-repository.js";
import { fixedClock } from "../helpers/fixed-clock.js";
import { ArticleSourceMissingError } from "@/modules/article/article.errors.js";
import { createGenerationService } from "@/modules/generation/generation.service.js";
import {
    GenerationInProgressError,
    GenerationLockUnavailableError,
    GenerationRefusedError,
} from "@/modules/generation/generation.errors.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { QuizCandidate } from "@/modules/generation/generation.entity.js";
import type {
    GenerateQuizInput,
    GenerationUsage,
    QuizGenerator,
} from "@/modules/generation/ports/generator.port.js";
import type { GenerationLock } from "@/modules/generation/ports/lock.port.js";
import type { GenerationRepository } from "@/modules/generation/ports/repository.port.js";
import type { GenerationService } from "@/modules/generation/ports/service.port.js";
import type { CreateQuizInput } from "@/modules/quiz/dto/quiz.dto.js";
import type {
    CreatedQuizRef,
    QuizPublicApi,
} from "@/modules/quiz/ports/public-api.port.js";

const NOW = "2026-03-01T10:00:00.000Z";
const ARTICLE_HTML = "<p>Some article text.</p>";

const articles = (overrides: Partial<ArticlePublicApi> = {}): ArticlePublicApi => ({
    getArticle: async (articleId) => ({ id: articleId, filename: "lambda.html" }),
    readArticleSource: async (articleId) => ({
        id: articleId,
        filename: "lambda.html",
        html: ARTICLE_HTML,
    }),
    ...overrides,
});

const cannedCandidate = (overrides: Partial<QuizCandidate> = {}): QuizCandidate => ({
    title: "AWS Lambda Cold Starts",
    topic: "AWS",
    topicSource: "new",
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
    ],
    ...overrides,
});

const USAGE: GenerationUsage = {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
};

type GeneratorStub = QuizGenerator & { calls: () => GenerateQuizInput[] };

const stubGenerator = (
    behavior: (
        input: GenerateQuizInput,
    ) => Promise<{ candidate: QuizCandidate; usage: GenerationUsage }>,
): GeneratorStub => {
    const calls: GenerateQuizInput[] = [];

    return {
        calls: () => [...calls],
        generate: async (input) => {
            calls.push(input);

            return behavior(input);
        },
    };
};

const cannedGenerator = (overrides: Partial<QuizCandidate> = {}): GeneratorStub =>
    stubGenerator(async () => ({
        candidate: cannedCandidate(overrides),
        usage: USAGE,
    }));

const throwingGenerator = (error: Error): GeneratorStub =>
    stubGenerator(async () => {
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
        generator?: GeneratorStub;
        articles?: ArticlePublicApi;
        quizzes?: ReturnType<typeof quizzes>;
        lockRenewSeconds?: number;
    } = {},
) => {
    const repository = createInMemoryGenerationRepository();
    const lock = overrides.lock ?? createInMemoryGenerationLock();
    const generator = overrides.generator ?? cannedGenerator();
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
        { lockRenewSeconds: overrides.lockRenewSeconds ?? 30 },
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
                generator: cannedGenerator(),
                articles: articles(),
                quizzes: quizzes(),
                clock: fixedClock(NOW),
                tokens: testTokenGenerator,
            },
            { lockRenewSeconds: 30 },
        );

        await expect(service.startGeneration({ articleId: 1 })).rejects.toThrow(
            "db unavailable",
        );
        await expect(lock.holder()).resolves.toBeNull();
    });
});

describe("generation service — topic reconciliation (D7)", () => {
    it("snaps a model-picked topic to the stored casing of an existing one", async () => {
        const { service, quizzes: quizApi } = buildService({
            quizzes: quizzes({ listTopics: async () => ["AWS Lambda"] }),
            generator: cannedGenerator({ topic: "aws lambda" }),
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
            generator: cannedGenerator({ topic: "  Terraform   Modules  " }),
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
        const slowGenerator = stubGenerator(async () => {
            await sleep(20);

            return { candidate: cannedCandidate(), usage: USAGE };
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
                generator: cannedGenerator(),
                articles: articles(),
                quizzes: quizzes(),
                clock: fixedClock(NOW),
                tokens: testTokenGenerator,
            },
            { lockRenewSeconds: 30 },
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
