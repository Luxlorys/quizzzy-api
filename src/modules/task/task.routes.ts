import {
    createTaskBodySchema,
    listTasksQuerySchema,
    taskPageResponseSchema,
    taskParamsSchema,
    taskResponseSchema,
} from "./task.schema.js";
import {
    toCreateTaskInput,
    toListTasksInput,
    toTaskPageResponse,
    toTaskResponse,
} from "./task.dto.js";
import { errorResponseSchema } from "@/lib/schemas.js";
import type { TaskService } from "./task.ports.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const TASK_TAG = "tasks";

export const taskRoutes =
    (service: TaskService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [TASK_TAG],
                    summary: "Create a task",
                    body: createTaskBodySchema,
                    response: {
                        201: taskResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const task = await service.createTask(
                    toCreateTaskInput(request.body),
                );

                return reply.code(201).send(toTaskResponse(task));
            },
        );

        fastify.get(
            "/",
            {
                schema: {
                    tags: [TASK_TAG],
                    summary: "List tasks (newest first, cursor-paginated)",
                    querystring: listTasksQuerySchema,
                    response: {
                        200: taskPageResponseSchema,
                    },
                },
            },
            async (request) => {
                const page = await service.listTasks(
                    toListTasksInput(request.query),
                );

                return toTaskPageResponse(page);
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [TASK_TAG],
                    summary: "Get a task by id",
                    params: taskParamsSchema,
                    response: {
                        200: taskResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const task = await service.getTask(request.params.id);

                return toTaskResponse(task);
            },
        );

        fastify.post(
            "/:id/complete",
            {
                schema: {
                    tags: [TASK_TAG],
                    summary: "Mark a task as done",
                    params: taskParamsSchema,
                    response: {
                        200: taskResponseSchema,
                        404: errorResponseSchema,
                        409: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const task = await service.completeTask(request.params.id);

                return toTaskResponse(task);
            },
        );

        fastify.post(
            "/:id/archive",
            {
                schema: {
                    tags: [TASK_TAG],
                    summary: "Archive a task (idempotent)",
                    params: taskParamsSchema,
                    response: {
                        200: taskResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const task = await service.archiveTask(request.params.id);

                return toTaskResponse(task);
            },
        );
    };
