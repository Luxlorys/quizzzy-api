import { ConflictError, NotFoundError, UnprocessableError } from "@/lib/errors.js";

export class QuizNotFoundError extends NotFoundError {
    constructor() {
        super("Quiz not found.");
    }
}

export class QuizArticleMissingError extends NotFoundError {
    constructor() {
        super("The article this quiz was built from no longer exists.");
    }
}

export class AttemptNotFoundError extends NotFoundError {
    constructor() {
        super("Attempt not found.");
    }
}

export class EmptyQuizError extends UnprocessableError {
    constructor() {
        super("A quiz needs at least one question.");
    }
}

export class NotEnoughOptionsError extends UnprocessableError {
    constructor() {
        super("A question needs at least two options.");
    }
}

export class InvalidAnswerKeyError extends UnprocessableError {
    constructor() {
        super(
            "A single-select question needs exactly one correct option, a multi-select question at least one.",
        );
    }
}

export class UnknownQuestionError extends UnprocessableError {
    constructor() {
        super("An answer refers to a question this quiz does not contain.");
    }
}

export class UnknownOptionError extends UnprocessableError {
    constructor() {
        super("An answer refers to an option its question does not offer.");
    }
}

export class DuplicateAnswerError extends UnprocessableError {
    constructor() {
        super("A question can be answered only once per attempt.");
    }
}

export class InvalidSelectionError extends UnprocessableError {
    constructor() {
        super("A single-select question accepts exactly one option.");
    }
}

export class QuestionOutOfRangeError extends UnprocessableError {
    constructor() {
        super("The question index is outside this quiz.");
    }
}

export class AttemptAlreadySubmittedError extends ConflictError {
    constructor() {
        super("This attempt has already been submitted.");
    }
}

export class AttemptNotSubmittedError extends ConflictError {
    constructor() {
        super("This attempt has not been submitted yet.");
    }
}
