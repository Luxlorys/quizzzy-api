import { archiveTask, completeTask, draftTask } from "./task.entity.js";
import { toTaskDto, toTaskPageDto } from "./task.dto.js";
import { TaskNotFoundError } from "./task.errors.js";
import type { Task } from "./task.entity.js";
import type { TaskService, TaskServiceDeps } from "./task.ports.js";

const orNotFound = (task: Task | null): Task => {
    if (task === null) {
        throw new TaskNotFoundError();
    }

    return task;
};

export const createTaskService = ({
    repository,
    cache,
    clock,
}: TaskServiceDeps): TaskService => {
    const readTask = async (id: number): Promise<Task> => {
        const cached = await cache.read(id);

        if (cached !== null) {
            return cached;
        }

        const task = orNotFound(await repository.findById(id));

        await cache.write(task);

        return task;
    };

    const loadForUpdate = async (id: number): Promise<Task> =>
        orNotFound(await repository.findById(id));

    const persist = async (task: Task): Promise<Task> => {
        const saved = await repository.save(task);

        await cache.forget(saved.id);

        return saved;
    };

    return {
        createTask: async (input) =>
            toTaskDto(await repository.create(draftTask(input, clock.now()))),

        getTask: async (id) => toTaskDto(await readTask(id)),

        listTasks: async (query) => toTaskPageDto(await repository.list(query)),

        completeTask: async (id) =>
            toTaskDto(await persist(completeTask(await loadForUpdate(id)))),

        archiveTask: async (id) =>
            toTaskDto(await persist(archiveTask(await loadForUpdate(id)))),
    };
};
