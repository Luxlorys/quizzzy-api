import { TASK_STATUSES } from "./task.entity.js";
import type { Task } from "./task.entity.js";
import type { TaskCache } from "./task.ports.js";
import type { Redis } from "ioredis";

const KEY_VERSION = "v1";

const keyFor = (id: number) => `task:${KEY_VERSION}:${id}`;

const parseTask = (raw: string): Task | null => {
    const value: unknown = JSON.parse(raw);

    if (typeof value !== "object" || value === null) {
        return null;
    }

    const { id, title, status, dueDate, createdAt } = value as Record<
        string,
        unknown
    >;

    if (
        typeof id !== "number" ||
        typeof title !== "string" ||
        typeof status !== "string" ||
        !TASK_STATUSES.includes(status as Task["status"]) ||
        typeof createdAt !== "string" ||
        (dueDate !== null && typeof dueDate !== "string")
    ) {
        return null;
    }

    return {
        id,
        title,
        status: status as Task["status"],
        dueDate: dueDate === null ? null : new Date(dueDate),
        createdAt: new Date(createdAt),
    };
};

export const createRedisTaskCache = (
    redis: Redis,
    ttlSeconds: number,
): TaskCache => ({
    read: async (id) => {
        try {
            const raw = await redis.get(keyFor(id));

            return raw === null ? null : parseTask(raw);
        } catch {
            return null;
        }
    },

    write: async (task) => {
        try {
            await redis.set(keyFor(task.id), JSON.stringify(task), "EX", ttlSeconds);
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
