import { describe, expect, it } from "vitest";
import { archiveTask, completeTask, draftTask } from "@/modules/task/task.entity.js";
import {
    DueDateInPastError,
    TaskAlreadyDoneError,
    TaskArchivedError,
} from "@/modules/task/task.errors.js";
import type { Task } from "@/modules/task/task.entity.js";

const NOW = new Date("2026-08-20T12:00:00Z");

const openTask = (overrides: Partial<Task> = {}): Task => ({
    id: 1,
    title: "write the report",
    status: "open",
    dueDate: null,
    createdAt: NOW,
    ...overrides,
});

describe("draftTask", () => {
    it("creates an open task with a null due date by default", () => {
        const draft = draftTask({ title: "write the report" }, NOW);

        expect(draft).toEqual({
            title: "write the report",
            status: "open",
            dueDate: null,
        });
    });

    it("accepts a due date in the future", () => {
        const dueDate = new Date("2026-08-21T12:00:00Z");

        const draft = draftTask({ title: "write the report", dueDate }, NOW);

        expect(draft.dueDate).toEqual(dueDate);
    });

    it("rejects a due date in the past", () => {
        const dueDate = new Date("2026-08-19T12:00:00Z");

        expect(() => draftTask({ title: "too late", dueDate }, NOW)).toThrow(
            DueDateInPastError,
        );
    });
});

describe("completeTask", () => {
    it("marks an open task as done", () => {
        const done = completeTask(openTask());

        expect(done.status).toBe("done");
    });

    it("does not mutate the original task", () => {
        const task = openTask();

        completeTask(task);

        expect(task.status).toBe("open");
    });

    it("rejects completing a task twice", () => {
        expect(() => completeTask(openTask({ status: "done" }))).toThrow(
            TaskAlreadyDoneError,
        );
    });

    it("rejects completing an archived task", () => {
        expect(() => completeTask(openTask({ status: "archived" }))).toThrow(
            TaskArchivedError,
        );
    });
});

describe("archiveTask", () => {
    it("archives an open task", () => {
        expect(archiveTask(openTask()).status).toBe("archived");
    });

    it("archives a done task", () => {
        expect(archiveTask(openTask({ status: "done" })).status).toBe("archived");
    });

    it("is idempotent on an archived task", () => {
        const archived = openTask({ status: "archived" });

        expect(archiveTask(archived)).toBe(archived);
    });
});
