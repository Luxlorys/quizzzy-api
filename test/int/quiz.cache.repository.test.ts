import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedisQuizCache } from "@/modules/quiz/quiz.cache.repository.js";
import type { Quiz } from "@/modules/quiz/quiz.entity.js";

const TTL_SECONDS = 60;

const quiz: Quiz = {
    id: 1,
    articleId: 7,
    title: "AWS Lambda Cold Starts",
    topic: "AWS",
    sourceName: "lambda-deep-dive.html",
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    questions: [
        {
            id: 10,
            position: 0,
            kind: "single",
            prompt: "What causes a cold start?",
            explanation: "A fresh execution environment.",
            options: [
                { id: 100, text: "A new environment", isCorrect: true },
                { id: 101, text: "Low memory", isCorrect: false },
            ],
        },
    ],
};

describe("Redis quiz cache", () => {
    let redis: Redis;
    let cache: ReturnType<typeof createRedisQuizCache>;

    beforeAll(() => {
        redis = new Redis(process.env.REDIS_URL ?? "", {
            maxRetriesPerRequest: 1,
        });

        cache = createRedisQuizCache(redis, TTL_SECONDS);
    });

    afterAll(async () => {
        await redis.quit();
    });

    it("revives dates and the nested question shape on the way out", async () => {
        await cache.write(quiz);

        const cached = await cache.read(quiz.id);

        expect(cached).toEqual(quiz);
        expect(cached?.createdAt).toBeInstanceOf(Date);
        expect(cached?.questions[0]?.options).toHaveLength(2);
    });

    it("misses for a quiz it was never given", async () => {
        await expect(cache.read(404)).resolves.toBeNull();
    });

    it("expires under the configured TTL", async () => {
        await cache.write(quiz);

        const ttl = await redis.ttl(`quiz:v1:${quiz.id}`);

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(TTL_SECONDS);
    });

    it("forgets a quiz on invalidation", async () => {
        await cache.write(quiz);
        await cache.forget(quiz.id);

        await expect(cache.read(quiz.id)).resolves.toBeNull();
    });

    it.each([
        ["a quiz field of the wrong type", { ...quiz, sourceName: 42 }],
        ["a missing quiz field", { ...quiz, topic: undefined }],
        ["a date that is no longer a string", { ...quiz, createdAt: 1234 }],
        [
            "a question of an unknown kind",
            { ...quiz, questions: [{ ...quiz.questions[0], kind: "ordered" }] },
        ],
        [
            "a question field of the wrong type",
            { ...quiz, questions: [{ ...quiz.questions[0], prompt: null }] },
        ],
        [
            "an option field of the wrong type",
            {
                ...quiz,
                questions: [
                    {
                        ...quiz.questions[0],
                        options: [{ id: "1", text: "x", isCorrect: true }],
                    },
                ],
            },
        ],
        ["questions that are not an array", { ...quiz, questions: {} }],
        ["a blob that is not an object at all", "just a string"],
    ])("treats %s as a miss", async (_case, blob) => {
        await redis.set(`quiz:v1:${quiz.id}`, JSON.stringify(blob));

        await expect(cache.read(quiz.id)).resolves.toBeNull();
    });

    it("treats malformed JSON as a miss", async () => {
        await redis.set(`quiz:v1:${quiz.id}`, "{ not json");

        await expect(cache.read(quiz.id)).resolves.toBeNull();
    });

    it("degrades to a miss when Redis is unreachable", async () => {
        const dead = new Redis(1, "127.0.0.1", {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            retryStrategy: () => null,
        });

        dead.on("error", () => undefined);

        const brokenCache = createRedisQuizCache(dead, TTL_SECONDS);

        await expect(brokenCache.read(quiz.id)).resolves.toBeNull();
        await expect(brokenCache.write(quiz)).resolves.toBeUndefined();
        await expect(brokenCache.forget(quiz.id)).resolves.toBeUndefined();

        dead.disconnect();
    });
});
