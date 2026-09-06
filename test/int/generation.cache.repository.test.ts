import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedisGenerationLock } from "@/modules/generation/generation.cache.repository.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Redis generation lock", () => {
    let redis: Redis;
    let lock: ReturnType<typeof createRedisGenerationLock>;

    beforeAll(() => {
        redis = new Redis(process.env.REDIS_URL ?? "", { maxRetriesPerRequest: 1 });
        lock = createRedisGenerationLock(redis, 60);
    });

    afterAll(async () => {
        await redis.quit();
    });

    it("acquires a free lock and refuses a second acquire while it is held", async () => {
        await expect(lock.acquire("token-a")).resolves.toBe(true);
        await expect(lock.acquire("token-b")).resolves.toBe(false);
    });

    it("does not free the lock when releasing with the wrong token", async () => {
        await lock.acquire("token-c");

        await lock.release("token-wrong");

        await expect(lock.holder()).resolves.toBe("token-c");
    });

    it("refuses to renew with the wrong token, but renews with the right one", async () => {
        await lock.acquire("token-d");

        await expect(lock.renew("token-wrong")).resolves.toBe(false);
        await expect(lock.renew("token-d")).resolves.toBe(true);
    });

    it("becomes acquirable again once the TTL expires", async () => {
        const shortLock = createRedisGenerationLock(redis, 0.05);

        await shortLock.acquire("token-e");
        await sleep(150);

        await expect(shortLock.acquire("token-f")).resolves.toBe(true);
    });

    it("reports the current holder, or null when the lock is free", async () => {
        await expect(lock.holder()).resolves.toBeNull();

        await lock.acquire("token-g");

        await expect(lock.holder()).resolves.toBe("token-g");
    });

    it("throws — never returns a silent false or null — when Redis is unreachable", async () => {
        const dead = new Redis(1, "127.0.0.1", {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            retryStrategy: () => null,
        });

        dead.on("error", () => undefined);

        const brokenLock = createRedisGenerationLock(dead, 60);

        await expect(brokenLock.acquire("token")).rejects.toThrow();
        await expect(brokenLock.renew("token")).rejects.toThrow();
        await expect(brokenLock.release("token")).rejects.toThrow();
        await expect(brokenLock.holder()).rejects.toThrow();

        dead.disconnect();
    });
});
