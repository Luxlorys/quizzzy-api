/**
 * The application's error vocabulary. Framework-free on purpose: no HTTP
 * status codes here. Services and entities throw these (or module-specific
 * subclasses of them); the translation to a status code happens in exactly
 * one place — src/plugins/error-handler.ts.
 *
 * A module defines its own named errors by subclassing:
 *
 *   export class TaskNotFoundError extends NotFoundError {
 *       constructor() {
 *           super("Task not found.");
 *       }
 *   }
 */
export type AppErrorCode =
    "NOT_FOUND" | "CONFLICT" | "UNPROCESSABLE" | "UNAUTHORIZED" | "FORBIDDEN";

export abstract class AppError extends Error {
    abstract readonly code: AppErrorCode;

    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/** The requested resource does not exist. */
export class NotFoundError extends AppError {
    readonly code = "NOT_FOUND";
}

/** The request is valid but conflicts with the current state of the resource. */
export class ConflictError extends AppError {
    readonly code = "CONFLICT";
}

/** The request is well-formed but violates a business rule. */
export class UnprocessableError extends AppError {
    readonly code = "UNPROCESSABLE";
}

/** The caller is not authenticated. */
export class UnauthorizedError extends AppError {
    readonly code = "UNAUTHORIZED";
}

/** The caller is authenticated but not allowed to do this. */
export class ForbiddenError extends AppError {
    readonly code = "FORBIDDEN";
}
