import { systemClock } from "@/lib/clock.js";
import type { Clock } from "@/lib/clock.js";
import type { Task } from "@/modules/task/task.entity.js";
import type { TaskRepository } from "@/modules/task/task.ports.js";

/**
 * A genuine implementation of the TaskRepository port, not a mock: it honors
 * the same contract as the Prisma implementation (auto-incrementing ids,
 * newest-first ordering, cursor semantics). Unit tests exercising the service
 * against this run the same code paths production does — minus the database.
 */
export const createInMemoryTaskRepository = (
    clock: Clock = systemClock,
): TaskRepository & { rows: () => Task[] } => {
    let nextId = 1;
    let rows: Task[] = [];

    return {
        rows: () => [...rows],

        create: async (data) => {
            const task: Task = {
                id: nextId++,
                title: data.title,
                status: data.status,
                dueDate: data.dueDate,
                createdAt: clock.now(),
            };

            rows = [...rows, task];

            return task;
        },

        findById: async (id) => rows.find((task) => task.id === id) ?? null,

        save: async (task) => {
            rows = rows.map((row) => (row.id === task.id ? task : row));

            return task;
        },

        list: async ({ limit, cursor, status }) => {
            const matching = rows
                .filter((task) => status === undefined || task.status === status)
                .filter((task) => cursor === undefined || task.id < cursor)
                .sort((a, b) => b.id - a.id);

            const items = matching.slice(0, limit);
            const last = items.at(-1);
            const nextCursor = matching.length > limit && last ? last.id : null;

            return { items, nextCursor };
        },
    };
};
