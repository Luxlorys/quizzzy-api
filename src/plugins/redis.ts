import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";

/**
 * Owns the Redis client lifecycle — and nothing else. No key names, no TTLs,
 * no cache logic: the plugin provides the raw client; what caching is FOR is a
 * module's port (see modules/quiz/ports/cache.port.ts), and how it maps to Redis is
 * that module's adapter (quiz.cache.repository.ts).
 *
 * Redis is a hard boot dependency: the generation lock (modules/generation)
 * has nowhere else to live, so a Redis that never comes up must fail the boot
 * rather than serve traffic it cannot safely generate against. `lazyConnect`
 * is what makes an explicit, awaited `connect()` possible here instead of an
 * implicit connect-on-first-command. Once connected, quiz caching still
 * degrades to database reads on a later outage — `maxRetriesPerRequest: 1`
 * and `enableOfflineQueue: false` are what make that degradation fast: ioredis
 * defaults to 20 retries, which would turn a Redis outage into 20 retries of
 * added latency on every request instead of one quick failure.
 */
const redis = async (fastify: FastifyInstance) => {
    const client = new Redis(fastify.config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
    });

    // A Redis outage after boot must not crash the process: ioredis emits
    // `error` on the client, and an unhandled 'error' event is a fatal
    // exception in Node. This listener has to be registered before connect()
    // below, or a boot-time connection failure throws unhandled instead of
    // rejecting the returned promise.
    client.on("error", (error) => {
        fastify.log.warn({ err: error }, "redis client error");
    });

    await client.connect();

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
