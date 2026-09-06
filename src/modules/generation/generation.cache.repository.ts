import type { GenerationLock } from "./ports/lock.port.js";
import type { Redis, Result } from "ioredis";

const KEY_VERSION = "v1";
const LOCK_KEY = `generation:${KEY_VERSION}:lock`;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
end
return 0
`;

const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

declare module "ioredis" {
    interface RedisCommander<Context> {
        releaseLock(key: string, token: string): Result<number, Context>;
        renewLock(
            key: string,
            token: string,
            ttlMs: number,
        ): Result<number, Context>;
    }
}

const withLockCommands = (redis: Redis): Redis => {
    if (typeof redis.releaseLock !== "function") {
        redis.defineCommand("releaseLock", { numberOfKeys: 1, lua: RELEASE_SCRIPT });
    }

    if (typeof redis.renewLock !== "function") {
        redis.defineCommand("renewLock", { numberOfKeys: 1, lua: RENEW_SCRIPT });
    }

    return redis;
};

export const createRedisGenerationLock = (
    redis: Redis,
    ttlSeconds: number,
): GenerationLock => {
    const client = withLockCommands(redis);
    const ttlMs = ttlSeconds * 1000;

    return {
        acquire: async (token) => {
            const result = await client.set(LOCK_KEY, token, "PX", ttlMs, "NX");

            return result === "OK";
        },

        renew: async (token) => {
            const result = await client.renewLock(LOCK_KEY, token, ttlMs);

            return result === 1;
        },

        release: async (token) => {
            await client.releaseLock(LOCK_KEY, token);
        },

        holder: async () => client.get(LOCK_KEY),
    };
};
