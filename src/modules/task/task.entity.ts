import {
    DueDateInPastError,
    TaskAlreadyDoneError,
    TaskArchivedError,
} from "./task.errors.js";

export const TASK_STATUSES = ["open", "done", "archived"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Task = {
    id: number;
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
    createdAt: Date;
};

export type NewTask = {
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
};

export const draftTask = (
    input: { title: string; dueDate?: Date | null },
    now: Date,
): NewTask => {
    const dueDate = input.dueDate ?? null;

    if (dueDate !== null && dueDate.getTime() < now.getTime()) {
        throw new DueDateInPastError();
    }

    return { title: input.title, status: "open", dueDate };
};

export const completeTask = (task: Task): Task => {
    if (task.status === "archived") {
        throw new TaskArchivedError();
    }

    if (task.status === "done") {
        throw new TaskAlreadyDoneError();
    }

    return { ...task, status: "done" };
};

export const archiveTask = (task: Task): Task => {
    if (task.status === "archived") {
        return task;
    }

    return { ...task, status: "archived" };
};
