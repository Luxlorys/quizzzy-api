import { TaskNotFoundError } from "./task.errors.js";
import type { Task } from "./task.entity.js";
import type { TaskRepository } from "./task.ports.js";
import type { PrismaClient, Task as TaskRow } from "@/generated/prisma/client.js";

const toTask = (row: TaskRow): Task => ({
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
});

export const createPrismaTaskRepository = (
    prisma: PrismaClient,
): TaskRepository => ({
    create: async (data) => {
        const row = await prisma.task.create({
            data: {
                title: data.title,
                status: data.status,
                dueDate: data.dueDate,
            },
        });

        return toTask(row);
    },

    findById: async (id) => {
        const row = await prisma.task.findUnique({ where: { id } });

        return row === null ? null : toTask(row);
    },

    save: async (task) => {
        const row = await prisma.task
            .update({
                where: { id: task.id },
                data: {
                    title: task.title,
                    status: task.status,
                    dueDate: task.dueDate,
                },
            })
            .catch((error: unknown) => {
                if (isRecordNotFound(error)) {
                    throw new TaskNotFoundError();
                }

                throw error;
            });

        return toTask(row);
    },

    list: async ({ limit, cursor, status }) => {
        const rows = await prisma.task.findMany({
            where: {
                ...(status !== undefined && { status }),
                ...(cursor !== undefined && { id: { lt: cursor } }),
            },
            orderBy: { id: "desc" },
            take: limit + 1,
        });

        const items = rows.slice(0, limit).map(toTask);
        const last = items.at(-1);
        const nextCursor = rows.length > limit && last ? last.id : null;

        return { items, nextCursor };
    },
});

const isRecordNotFound = (error: unknown): boolean => {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025"
    );
};
