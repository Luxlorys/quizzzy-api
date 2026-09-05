import { describe, expect, it } from "vitest";
import { createTaskService } from "@/modules/task/task.service.js";
import {
    DueDateInPastError,
    TaskAlreadyDoneError,
    TaskArchivedError,
    TaskNotFoundError,
} from "@/modules/task/task.errors.js";
import { fixedClock } from "../helpers/fixed-clock.js";
import {
    createBrokenTaskCache,
    createInMemoryTaskCache,
} from "../helpers/in-memory-task-cache.js";
import { createInMemoryTaskRepository } from "../helpers/in-memory-task-repository.js";
import type { TaskCache, TaskRepository } from "@/modules/task/task.ports.js";

/**
 * Use-case tests: real service, real entity rules, in-memory port
 * implementations. No Fastify, no database, no Redis, no mocking framework.
 *
 * The caching policy is tested here too, because here is where it lives: the
 * service holds the cache port directly, so a hit, a miss and an invalidation
 * are all observable through the use cases that own them.
 */
const NOW = "2026-08-20T12:00:00Z";

/**
 * Counts reads of the source of truth, so a cache HIT is observable rather
 * than inferred — the result alone looks identical either way.
 */
const countingRepository = (inner: TaskRepository) => {
    let findByIdCalls = 0;

    return {
        repository: {
            ...inner,
            findById: async (id: number) => {
                findByIdCalls++;

                return inner.findById(id);
            },
        } satisfies TaskRepository,
        findByIdCalls: () => findByIdCalls,
    };
};

const makeService = (cache: TaskCache = createInMemoryTaskCache()) => {
    const clock = fixedClock(NOW);
    const repository = createInMemoryTaskRepository(clock);
    const service = createTaskService({ repository, cache, clock });

    return { service, repository };
};

/** The same service, with both the source reads and the cache observable. */
const makeObservableService = () => {
    const clock = fixedClock(NOW);
    const source = createInMemoryTaskRepository(clock);
    const counting = countingRepository(source);
    const cache = createInMemoryTaskCache();

    return {
        service: createTaskService({
            repository: counting.repository,
            cache,
            clock,
        }),
        source,
        cache,
        findByIdCalls: counting.findByIdCalls,
    };
};

describe("createTask", () => {
    it("persists and returns the created task", async () => {
        const { service, repository } = makeService();

        const task = await service.createTask({ title: "ship the template" });

        expect(task).toMatchObject({
            title: "ship the template",
            status: "open",
            dueDate: null,
        });
        expect(repository.rows()).toHaveLength(1);
    });

    it("rejects a due date before now", async () => {
        const { service, repository } = makeService();

        await expect(
            service.createTask({
                title: "too late",
                dueDate: new Date("2026-08-20T11:59:59Z"),
            }),
        ).rejects.toBeInstanceOf(DueDateInPastError);

        expect(repository.rows()).toHaveLength(0);
    });
});

describe("getTask", () => {
    it("returns the task by id", async () => {
        const { service } = makeService();
        const created = await service.createTask({ title: "find me" });

        await expect(service.getTask(created.id)).resolves.toEqual(created);
    });

    it("throws TaskNotFoundError for an unknown id", async () => {
        const { service } = makeService();

        await expect(service.getTask(999)).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it("fills the cache on a miss and serves the second read without touching the source", async () => {
        const { service, cache, findByIdCalls } = makeObservableService();

        const created = await service.createTask({ title: "Write the ADR" });

        const first = await service.getTask(created.id);
        const second = await service.getTask(created.id);

        expect(first).toEqual(created);
        expect(second).toEqual(created);
        expect(cache.keys()).toEqual([created.id]);
        // One database read for two calls — that is the cache working.
        expect(findByIdCalls()).toBe(1);
    });

    it("does not cache a miss, so a later create is visible immediately", async () => {
        const { service, cache } = makeObservableService();

        await expect(service.getTask(1)).rejects.toBeInstanceOf(TaskNotFoundError);
        expect(cache.keys()).toEqual([]);

        const created = await service.createTask({ title: "Appears later" });

        await expect(service.getTask(created.id)).resolves.toEqual(created);
    });

    it("does not swallow cache errors — resilience belongs to the implementation", async () => {
        const { service } = makeService(createBrokenTaskCache());

        const created = await service.createTask({ title: "Redis is on fire" });

        // Deliberate. What keeps a Redis outage from failing requests is
        // task.cache.repository.ts, which catches and returns null — proven
        // against a dead server in test/int/task.cache.repository.test.ts.
        // Catching here instead would hide a genuinely broken port
        // implementation behind a silent fallback, and no test would notice.
        await expect(service.getTask(created.id)).rejects.toThrow(
            "cache unavailable",
        );
    });
});

describe("completeTask", () => {
    it("persists the transition to done", async () => {
        const { service, repository } = makeService();
        const created = await service.createTask({ title: "finish me" });

        const done = await service.completeTask(created.id);

        expect(done.status).toBe("done");
        expect(repository.rows()[0]?.status).toBe("done");
    });

    it("surfaces the domain rule when completing twice", async () => {
        const { service } = makeService();
        const created = await service.createTask({ title: "once only" });

        await service.completeTask(created.id);

        await expect(service.completeTask(created.id)).rejects.toBeInstanceOf(
            TaskAlreadyDoneError,
        );
    });

    it("invalidates the cache, so the next query sees the new state", async () => {
        const { service, cache } = makeObservableService();

        const created = await service.createTask({ title: "Ship it" });

        await service.getTask(created.id);
        expect(cache.keys()).toEqual([created.id]);

        await service.completeTask(created.id);
        expect(cache.keys()).toEqual([]);

        expect(await service.getTask(created.id)).toMatchObject({ status: "done" });
    });
});

describe("listTasks", () => {
    it("returns newest first with a working cursor", async () => {
        const { service } = makeService();

        const first = await service.createTask({ title: "first" });
        const second = await service.createTask({ title: "second" });
        const third = await service.createTask({ title: "third" });

        const pageOne = await service.listTasks({ limit: 2 });

        expect(pageOne.items.map((task) => task.id)).toEqual([third.id, second.id]);
        expect(pageOne.nextCursor).toBe(second.id);

        const pageTwo = await service.listTasks({
            limit: 2,
            cursor: pageOne.nextCursor ?? undefined,
        });

        expect(pageTwo.items.map((task) => task.id)).toEqual([first.id]);
        expect(pageTwo.nextCursor).toBeNull();
    });

    it("filters by status", async () => {
        const { service } = makeService();

        await service.createTask({ title: "stays open" });
        const toComplete = await service.createTask({ title: "gets done" });

        await service.completeTask(toComplete.id);

        const done = await service.listTasks({ limit: 10, status: "done" });

        expect(done.items.map((task) => task.title)).toEqual(["gets done"]);
    });

    it("is never cached — every call reaches the source", async () => {
        const { service, cache } = makeObservableService();

        await service.createTask({ title: "A" });

        const first = await service.listTasks({ limit: 10 });
        await service.createTask({ title: "B" });
        const second = await service.listTasks({ limit: 10 });

        expect(first.items).toHaveLength(1);
        expect(second.items).toHaveLength(2);
        expect(cache.keys()).toEqual([]);
    });
});

describe("commands read the source of truth, not the cache", () => {
    it("refuses to complete a task that was archived behind a stale cache entry", async () => {
        const { service, cache } = makeObservableService();

        const created = await service.createTask({ title: "archived meanwhile" });

        await service.archiveTask(created.id);

        await cache.write(created);

        await expect(service.completeTask(created.id)).rejects.toBeInstanceOf(
            TaskArchivedError,
        );
    });

    it("does not write a stale snapshot back over the current row", async () => {
        const { service, source, cache } = makeObservableService();

        const created = await service.createTask({ title: "original title" });

        await source.save({ ...created, title: "renamed by someone else" });

        await cache.write(created);

        await service.completeTask(created.id);

        expect(source.rows()[0]).toMatchObject({
            title: "renamed by someone else",
            status: "done",
        });
    });

    it("still lets queries be served stale — that is the trade, and it is only for queries", async () => {
        const { service, source, cache } = makeObservableService();

        const created = await service.createTask({ title: "viewed" });

        await source.save({ ...created, status: "archived" });
        await cache.write(created);

        expect(await service.getTask(created.id)).toMatchObject({
            status: "open",
        });
    });
});
