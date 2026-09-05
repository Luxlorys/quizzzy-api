import { QUESTION_KINDS } from "./quiz.entity.js";
import type { Option, Question, Quiz } from "./quiz.entity.js";
import type { QuizCache } from "./quiz.ports.js";
import type { Redis } from "ioredis";

const KEY_VERSION = "v1";

const keyFor = (id: number) => `quiz:${KEY_VERSION}:${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isOption = (value: unknown): value is Option =>
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.text === "string" &&
    typeof value.isCorrect === "boolean";

const isQuestion = (value: unknown): value is Question =>
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.position === "number" &&
    QUESTION_KINDS.includes(value.kind as Question["kind"]) &&
    typeof value.prompt === "string" &&
    typeof value.explanation === "string" &&
    Array.isArray(value.options) &&
    value.options.every(isOption);

type CachedQuiz = Omit<Quiz, "createdAt"> & { createdAt: string };

const isCachedQuiz = (value: unknown): value is CachedQuiz =>
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.articleId === "number" &&
    typeof value.title === "string" &&
    typeof value.topic === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.questions) &&
    value.questions.every(isQuestion);

const parseQuiz = (raw: string): Quiz | null => {
    const value: unknown = JSON.parse(raw);

    if (!isCachedQuiz(value)) {
        return null;
    }

    return { ...value, createdAt: new Date(value.createdAt) };
};

export const createRedisQuizCache = (
    redis: Redis,
    ttlSeconds: number,
): QuizCache => ({
    read: async (id) => {
        try {
            const raw = await redis.get(keyFor(id));

            return raw === null ? null : parseQuiz(raw);
        } catch {
            return null;
        }
    },

    write: async (quiz) => {
        try {
            await redis.set(keyFor(quiz.id), JSON.stringify(quiz), "EX", ttlSeconds);
        } catch {
            return;
        }
    },

    forget: async (id) => {
        try {
            await redis.del(keyFor(id));
        } catch {
            return;
        }
    },
});
