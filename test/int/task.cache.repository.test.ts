import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedisTaskCache } from "@/modules/task/task.cache.repository.js";
import type { Task } from "@/modules/task/task.entity.js";

/**
 * Implementation contract test: the Redis implementation of the TaskCache port
 * against a real server. This is the half the unit lane cannot cover — the
 * JSON codec, the TTL, and the promise that a cache outage returns null
 * instead of throwing.
 *
 * The in-memory implementation in test/helpers/ must honor whatever this file
 * pins. When one changes, change both.
 */
const TTL_SECONDS = 60;

const aTask = (overrides: Partial<Task> = {}): Task => ({
    id: 1,
    title: "Write the recipe",
    status: "open",
    dueDate: new Date("2026-06-01T12:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
});

describe("createRedisTaskCache", () => {
    let redis: Redis;

    beforeAll(() => {
        redis = new Redis(process.env.REDIS_URL as string, {
            maxRetriesPerRequest: 1,
        });
    });

    afterAll(async () => {
        await redis.quit();
    });

    it("round-trips a task, reviving Dates that JSON flattened to strings", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);
        const task = aTask();

        await cache.write(task);

        const read = await cache.read(task.id);

        expect(read).toEqual(task);
        // toEqual would pass on ISO strings too — this is the assertion that
        // actually catches a missing revive step.
        expect(read?.createdAt).toBeInstanceOf(Date);
        expect(read?.dueDate).toBeInstanceOf(Date);
    });

    it("keeps a null dueDate null rather than reviving it into a Date", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);
        const task = aTask({ id: 2, dueDate: null });

        await cache.write(task);

        expect((await cache.read(2))?.dueDate).toBeNull();
    });

    it("returns null for a key that was never written", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);

        expect(await cache.read(999)).toBeNull();
    });

    it("applies the configured TTL so a lost invalidation cannot go stale forever", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);

        await cache.write(aTask({ id: 3 }));

        const ttl = await redis.ttl("task:v1:3");

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(TTL_SECONDS);
    });

    it("forgets an entry so the next read misses", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);
        const task = aTask({ id: 4 });

        await cache.write(task);
        expect(await cache.read(4)).not.toBeNull();

        await cache.forget(4);
        expect(await cache.read(4)).toBeNull();
    });

    it("treats a blob written by an older shape as a miss, not a crash", async () => {
        const cache = createRedisTaskCache(redis, TTL_SECONDS);

        // What a previous deploy might have left behind: valid JSON, wrong shape.
        await redis.set("task:v1:5", JSON.stringify({ id: 5, name: "renamed" }));

        expect(await cache.read(5)).toBeNull();
    });

    it("returns null instead of throwing when the server is unreachable", async () => {
        // Port 1 is reserved and never listening — a stand-in for Redis being
        // down. This is the promise the whole design rests on: a cache outage
        // degrades to a database read, it does not fail the request.
        const dead = new Redis("redis://127.0.0.1:1", {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            retryStrategy: () => null,
        });

        dead.on("error", () => {
            // Expected; an unhandled 'error' event would kill the process.
        });

        const cache = createRedisTaskCache(dead, TTL_SECONDS);

        await expect(cache.read(1)).resolves.toBeNull();
        await expect(cache.write(aTask())).resolves.toBeUndefined();
        await expect(cache.forget(1)).resolves.toBeUndefined();

        dead.disconnect();
    });
});
