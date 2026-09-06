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

export class InvalidCandidateAnswerKeyError extends UnprocessableError {
    constructor() {
        super(
            "A single-select question needs exactly one correct option, a multi-select question at least one.",
        );
    }
}

export class DuplicateCandidateOptionError extends UnprocessableError {
    constructor() {
        super("A question's option texts must be unique.");
    }
}

export class DuplicateCandidatePromptError extends UnprocessableError {
    constructor() {
        super("A quiz's question prompts must be unique.");
    }
}

export class QuestionCountOutOfRangeError extends UnprocessableError {
    constructor(actual: number, min: number, max: number) {
        super(
            `A quiz for this article needs between ${min} and ${max} questions, not ${actual}.`,
        );
    }
}

export class UnsafeTopicError extends UnprocessableError {
    constructor() {
        super("A topic may not contain a newline or angle brackets.");
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
    constructor() {
        super("The question generator is unavailable right now.");
    }
}

export class LockLostError extends UnprocessableError {
    constructor() {
        super("The generation lock was lost before the quiz could be saved.");
    }
}
