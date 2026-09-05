import { z } from "zod";
import { TASK_STATUSES } from "./task.entity.js";

export const createTaskBodySchema = z.object({
    title: z.string().trim().min(1).max(200),
    dueDate: z.coerce.date().optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

export const taskParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const listTasksQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.coerce.number().int().positive().optional(),
    status: z.enum(TASK_STATUSES).optional(),
});

export const taskResponseSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    status: z.enum(TASK_STATUSES),
    dueDate: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
});

export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const taskPageResponseSchema = z.object({
    items: z.array(taskResponseSchema),
    nextCursor: z.number().int().nullable(),
});
