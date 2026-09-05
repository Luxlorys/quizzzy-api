import { beforeEach, describe, expect, it } from "vitest";
import { createPrismaTaskRepository } from "@/modules/task/task.prisma.repository.js";
import { TaskNotFoundError } from "@/modules/task/task.errors.js";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createTasks } from "./factories/task.factory.js";
import type { FastifyInstance } from "fastify";
import type { TaskRepository } from "@/modules/task/task.ports.js";

/**
 * Implementation tests: the Prisma implementation of the port against a real
 * Postgres. These verify the contract the in-memory implementation mirrors —
 * ordering, cursor semantics, error translation.
 */
describe("prisma task repository", () => {
    let app: FastifyInstance;
    let repository: TaskRepository;

    beforeEach(async () => {
        app = await buildTestApp();
        repository = createPrismaTaskRepository(app.prisma);

        return async () => {
            await app.close();
        };
    });

    it("creates a task and returns the domain shape", async () => {
        const task = await repository.create({
            title: "persist me",
            status: "open",
            dueDate: null,
        });

        expect(task).toMatchObject({
            title: "persist me",
            status: "open",
            dueDate: null,
        });
        expect(task.id).toBeGreaterThan(0);
        expect(task.createdAt).toBeInstanceOf(Date);
    });

    it("findById returns null for a missing row", async () => {
        await expect(repository.findById(424242)).resolves.toBeNull();
    });

    it("save persists a state transition", async () => {
        const created = await repository.create({
            title: "to be done",
            status: "open",
            dueDate: null,
        });

        await repository.save({ ...created, status: "done" });

        await expect(repository.findById(created.id)).resolves.toMatchObject({
            status: "done",
        });
    });

    it("save translates a lost update race into the module's own error", async () => {
        const created = await repository.create({
            title: "ghost",
            status: "open",
            dueDate: null,
        });

        await app.prisma.task.delete({ where: { id: created.id } });

        await expect(repository.save(created)).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
    });

    it("list pages newest first and respects the status filter", async () => {
        const seeded = await createTasks({ prisma: app.prisma, count: 3 });
        const newestFirst = seeded.map((row) => row.id).sort((a, b) => b - a);

        const pageOne = await repository.list({ limit: 2 });

        expect(pageOne.items.map((task) => task.id)).toEqual(
            newestFirst.slice(0, 2),
        );
        expect(pageOne.nextCursor).toBe(newestFirst[1]);

        const pageTwo = await repository.list({
            limit: 2,
            cursor: pageOne.nextCursor ?? undefined,
        });

        expect(pageTwo.items.map((task) => task.id)).toEqual(newestFirst.slice(2));
        expect(pageTwo.nextCursor).toBeNull();

        const archivedOnly = await repository.list({
            limit: 10,
            status: "archived",
        });

        expect(archivedOnly.items).toEqual([]);
    });
});
