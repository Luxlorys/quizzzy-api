import { randomUUID } from "node:crypto";
import type {
    Prisma,
    PrismaClient,
    Task as TaskRow,
} from "@/generated/prisma/client.js";

/**
 * Arrange factory: seeds a precondition directly through Prisma so a test can
 * start from a known state without depending on another test having run.
 *
 * Never accepts or assumes an `id`. The per-test TRUNCATE restarts identity
 * sequences, so a hardcoded id is only ever accidentally correct — read the
 * id back off the returned row instead.
 */
type CreateTaskArgs = {
    prisma: PrismaClient;
    overrides?: Partial<Prisma.TaskUncheckedCreateInput>;
};

type CreateTasksArgs = CreateTaskArgs & {
    count: number;
};

export const createTask = async ({
    prisma,
    overrides = {},
}: CreateTaskArgs): Promise<TaskRow> => {
    return prisma.task.create({
        data: {
            title: `task-${randomUUID()}`,
            ...overrides,
        },
    });
};

export const createTasks = async ({
    prisma,
    count,
    overrides = {},
}: CreateTasksArgs): Promise<TaskRow[]> => {
    return prisma.task.createManyAndReturn({
        data: Array.from({ length: count }, () => ({
            title: `task-${randomUUID()}`,
            ...overrides,
        })),
    });
};
