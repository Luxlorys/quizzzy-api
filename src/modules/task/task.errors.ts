import { ConflictError, NotFoundError, UnprocessableError } from "@/lib/errors.js";

export class TaskNotFoundError extends NotFoundError {
    constructor() {
        super("Task not found.");
    }
}

export class DueDateInPastError extends UnprocessableError {
    constructor() {
        super("A task cannot be created with a due date in the past.");
    }
}

export class TaskAlreadyDoneError extends ConflictError {
    constructor() {
        super("Task is already completed.");
    }
}

export class TaskArchivedError extends ConflictError {
    constructor() {
        super("An archived task cannot be completed.");
    }
}
