import { Redis } from "ioredis";
import { afterAll, beforeEach } from "vitest";

let client: Redis | null = null;

const getClient = () => {
    if (client) {
        return client;
    }

    const redisUrl = process.env.REDIS_URL;

    // Refuse to flush anything that is not one of the throwaway logical
    // databases provisioned by global.ts — database 0 is the default a real
    // deployment would use, so a missing path here means env.ts did not run.
    if (redisUrl === undefined || new URL(redisUrl).pathname === "/0") {
        throw new Error(
            "reset-redis: REDIS_URL does not point at a per-worker test database — " +
                "env.ts must run before this file in setupFiles.",
        );
    }

    client = new Redis(redisUrl, { maxRetriesPerRequest: 1 });

    return client;
};

beforeEach(async () => {
    await getClient().flushdb();
});

afterAll(async () => {
    await client?.quit();

    client = null;
});
