import {
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableError,
} from "@/lib/errors.js";

export class GenerationNotFoundError extends NotFoundError {
    constructor() {
        super("Generation not found.");
    }
}

export class GenerationInProgressError extends ConflictError {
    constructor() {
        super("A generation is already running.");
    }
}

export class GenerationLockUnavailableError extends ServiceUnavailableError {
    constructor() {
        super("The generation lock store is unreachable.");
    }
}

export class ArticleTooLargeError extends UnprocessableError {
    constructor() {
        super("That article is too large to generate a quiz from.");
    }
}

export class EmptyArticleTextError extends UnprocessableError {
    constructor() {
        super("The article contains too little readable text.");
    }
}

export class GenerationInvalidOutputError extends UnprocessableError {
    constructor(reasons: string[] = []) {
        super(
            reasons.length === 0
                ? "The generated quiz did not pass validation."
                : `The generated quiz did not pass validation: ${reasons.join("; ")}.`,
        );
    }
}

export class GenerationRefusedError extends UnprocessableError {
    constructor(category?: string) {
        super(
            category === undefined
                ? "The model declined to generate a quiz for this article."
                : `The model declined to generate a quiz for this article (category: ${category}).`,
        );
    }
}

export class GenerationOutputTruncatedError extends UnprocessableError {
    constructor() {
        super("The model's response was truncated before it finished.");
    }
}

export class GenerationUnavailableError extends UnprocessableError {
    constructor(detail?: string) {
        super(
            detail === undefined
                ? "The question generator is unavailable right now."
                : `The question generator is unavailable right now: ${detail}`,
        );
    }
}

export class GenerationRequestRejectedError extends UnprocessableError {
    constructor(detail: string) {
        super(`The question generator rejected the request: ${detail}`);
    }
}

export class LockLostError extends UnprocessableError {
    constructor() {
        super("The generation lock was lost before the quiz could be saved.");
    }
}
