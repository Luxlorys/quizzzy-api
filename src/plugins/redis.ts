import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";

/**
 * Owns the Redis client lifecycle — and nothing else. No key names, no TTLs,
 * no cache logic: the plugin provides the raw client; what caching is FOR is a
 * module's port (see modules/task/task.ports.ts), and how it maps to Redis is
 * that module's adapter (task.cache.repository.ts).
 *
 * `lazyConnect` keeps boot independent of Redis being up — the app starts and
 * serves traffic, and cache reads degrade to the database until the client
 * connects. `maxRetriesPerRequest: 1` is what makes that degradation fast:
 * ioredis defaults to 20, which would turn a Redis outage into 20 retries of
 * added latency on every request instead of one quick failure.
 */
const redis = async (fastify: FastifyInstance) => {
    const client = new Redis(fastify.config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
    });

    // A Redis outage must not crash the process: ioredis emits `error` on the
    // client, and an unhandled 'error' event is a fatal exception in Node.
    client.on("error", (error) => {
        fastify.log.warn({ err: error }, "redis client error");
    });

    client.connect().catch((error: unknown) => {
        fastify.log.warn({ err: error }, "redis initial connection failed");
    });

    fastify.decorate("redis", client);

    fastify.addHook("onClose", async (instance) => {
        const client = instance.redis;

        try {
            // QUIT is a command, so it needs a writeable stream. With
            // `enableOfflineQueue: false` a client that is still connecting —
            // or already gone — rejects it, which would turn every app close
            // into a failure. Only say goodbye when there is someone to hear.
            if (client.status === "ready") {
                await client.quit();
            }
        } catch {
            // The connection dropped between the check and the command.
        } finally {
            client.disconnect();
        }
    });
};

export default fp(redis, { name: "redis" });
