import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createTask, createTasks } from "./factories/task.factory.js";
import type { FastifyInstance } from "fastify";

/**
 * HTTP tests drive the real stack — routing, validation, service, domain
 * rules, Prisma adapter, Postgres — through app.inject(). What they assert is
 * the wire contract: status codes, bodies, error shapes.
 */
describe("task routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildTestApp();

        return async () => {
            await app.close();
        };
    });

    describe("POST /api/tasks", () => {
        it("creates a task and returns 201 with the wire shape", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/tasks",
                body: { title: "ship it", dueDate: "2030-01-01T00:00:00.000Z" },
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                title: "ship it",
                status: "open",
                dueDate: "2030-01-01T00:00:00.000Z",
            });
            expect(response.json()).toHaveProperty("id");
            expect(response.json()).toHaveProperty("createdAt");
        });

        it("rejects an empty title with 400 and the uniform error body", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/tasks",
                body: { title: "   " },
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toHaveProperty("message");
        });

        it("maps the due-date domain rule to 422", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/tasks",
                body: { title: "too late", dueDate: "2000-01-01T00:00:00.000Z" },
            });

            expect(response.statusCode).toBe(422);
            expect(response.json()).toEqual({
                message: "A task cannot be created with a due date in the past.",
            });
        });
    });

    describe("GET /api/tasks/:id", () => {
        it("returns a seeded task", async () => {
            const seeded = await createTask({ prisma: app.prisma });

            const response = await app.inject({
                method: "GET",
                url: `/api/tasks/${seeded.id}`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                id: seeded.id,
                title: seeded.title,
            });
        });

        it("returns 404 for an unknown id", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/api/tasks/999999",
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual({ message: "Task not found." });
        });
    });

    describe("GET /api/tasks", () => {
        it("paginates newest first with a cursor", async () => {
            const seeded = await createTasks({ prisma: app.prisma, count: 3 });
            const ids = seeded.map((row) => row.id).sort((a, b) => b - a);

            const pageOne = await app.inject({
                method: "GET",
                url: "/api/tasks?limit=2",
            });

            expect(pageOne.statusCode).toBe(200);

            const pageOneBody = pageOne.json<{
                items: { id: number }[];
                nextCursor: number | null;
            }>();

            expect(pageOneBody.items.map((item) => item.id)).toEqual(
                ids.slice(0, 2),
            );
            expect(pageOneBody.nextCursor).toBe(ids[1]);

            const pageTwo = await app.inject({
                method: "GET",
                url: `/api/tasks?limit=2&cursor=${pageOneBody.nextCursor}`,
            });

            const pageTwoBody = pageTwo.json<{
                items: { id: number }[];
                nextCursor: number | null;
            }>();

            expect(pageTwoBody.items.map((item) => item.id)).toEqual(ids.slice(2));
            expect(pageTwoBody.nextCursor).toBeNull();
        });

        it("filters by status", async () => {
            await createTask({ prisma: app.prisma });
            const done = await createTask({
                prisma: app.prisma,
                overrides: { status: "done" },
            });

            const response = await app.inject({
                method: "GET",
                url: "/api/tasks?status=done",
            });

            const body = response.json<{ items: { id: number }[] }>();

            expect(body.items.map((item) => item.id)).toEqual([done.id]);
        });

        it("rejects an out-of-range limit", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/api/tasks?limit=1000",
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("journey: create → complete → archive", () => {
        it("walks the whole lifecycle in one test case", async () => {
            const created = await app.inject({
                method: "POST",
                url: "/api/tasks",
                body: { title: "full lifecycle" },
            });

            const { id } = created.json<{ id: number }>();

            const completed = await app.inject({
                method: "POST",
                url: `/api/tasks/${id}/complete`,
            });

            expect(completed.statusCode).toBe(200);
            expect(completed.json()).toMatchObject({ id, status: "done" });

            const completedTwice = await app.inject({
                method: "POST",
                url: `/api/tasks/${id}/complete`,
            });

            expect(completedTwice.statusCode).toBe(409);
            expect(completedTwice.json()).toEqual({
                message: "Task is already completed.",
            });

            const archived = await app.inject({
                method: "POST",
                url: `/api/tasks/${id}/archive`,
            });

            expect(archived.statusCode).toBe(200);
            expect(archived.json()).toMatchObject({ id, status: "archived" });

            const completeArchived = await app.inject({
                method: "POST",
                url: `/api/tasks/${id}/complete`,
            });

            expect(completeArchived.statusCode).toBe(409);
            expect(completeArchived.json()).toEqual({
                message: "An archived task cannot be completed.",
            });
        });
    });
});
