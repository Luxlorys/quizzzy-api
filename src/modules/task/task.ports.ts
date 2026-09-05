import type { NewTask, Task, TaskStatus } from "./task.entity.js";
import type { Clock } from "@/lib/clock.js";
import type { Page, PageQuery } from "@/lib/pagination.js";

export type TaskListQuery = PageQuery & {
    status?: TaskStatus;
};

export type TaskRepository = {
    create: (data: NewTask) => Promise<Task>;
    findById: (id: number) => Promise<Task | null>;
    save: (task: Task) => Promise<Task>;
    list: (query: TaskListQuery) => Promise<Page<Task>>;
};

export type TaskCache = {
    read: (id: number) => Promise<Task | null>;
    write: (task: Task) => Promise<void>;
    forget: (id: number) => Promise<void>;
};

export type TaskDto = {
    id: number;
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
    createdAt: Date;
};

export type CreateTaskInput = {
    title: string;
    dueDate?: Date | null;
};

export type ListTasksInput = {
    limit: number;
    cursor?: number;
    status?: TaskStatus;
};

export type TaskService = {
    createTask: (input: CreateTaskInput) => Promise<TaskDto>;
    getTask: (id: number) => Promise<TaskDto>;
    listTasks: (input: ListTasksInput) => Promise<Page<TaskDto>>;
    completeTask: (id: number) => Promise<TaskDto>;
    archiveTask: (id: number) => Promise<TaskDto>;
};

export type TaskServiceDeps = {
    repository: TaskRepository;
    cache: TaskCache;
    clock: Clock;
};

export type TaskPublicApi = {
    createTask: (input: { title: string }) => Promise<{ id: number }>;
};
