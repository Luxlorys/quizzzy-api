import type { Quiz } from "@/modules/quiz/quiz.entity.js";
import type { QuizCache } from "@/modules/quiz/ports/cache.port.js";

/**
 * A genuine implementation of the QuizCache port, not a mock. It honors the
 * same contract the Redis implementation honors — a miss is null, a write
 * replaces, a forget removes — so the service's unit tests run the production
 * code path with the container swapped out.
 *
 * `reads` and `keys` are exposed so a test can assert the database was NOT
 * consulted, which is the whole point of a cache and cannot be observed from
 * the result alone.
 */
export const createInMemoryQuizCache = (): QuizCache & {
    reads: () => number;
    keys: () => number[];
} => {
    const entries = new Map<number, Quiz>();
    let reads = 0;

    return {
        reads: () => reads,
        keys: () => [...entries.keys()],

        read: async (id) => {
            reads++;

            return entries.get(id) ?? null;
        },

        write: async (quiz) => {
            entries.set(quiz.id, quiz);
        },

        forget: async (id) => {
            entries.delete(id);
        },
    };
};

/**
 * A cache that is always down: every operation rejects. The port's contract
 * says a broken cache degrades to the source of truth rather than failing the
 * request — a promise kept by the Redis implementation, which catches, and
 * pinned against a dead server in test/int/quiz.cache.repository.test.ts.
 * Deliberately NOT swallowed by the service: a broken port implementation
 * hidden behind a silent fallback in the caller is a bug no test would see.
 */
export const createBrokenQuizCache = (): QuizCache => ({
    read: async () => {
        throw new Error("cache unavailable");
    },
    write: async () => {
        throw new Error("cache unavailable");
    },
    forget: async () => {
        throw new Error("cache unavailable");
    },
});
