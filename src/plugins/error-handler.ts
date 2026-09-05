import fp from "fastify-plugin";
import {
    hasZodFastifySchemaValidationErrors,
    isResponseSerializationError,
} from "fastify-type-provider-zod";
import { AppError } from "@/lib/errors.js";
import type { AppErrorCode } from "@/lib/errors.js";
import type { FastifyError, FastifyInstance } from "fastify";

/**
 * The single place where errors become HTTP. Services and entities throw
 * AppError subclasses in domain vocabulary; this plugin owns the mapping to
 * status codes. Every error body has the same shape: { "message": "..." }.
 */
const STATUS_BY_CODE: Record<AppErrorCode, number> = {
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
};

const BAD_REQUEST = 400;
const INTERNAL_SERVER_ERROR = 500;

const errorHandler = async (fastify: FastifyInstance) => {
    fastify.setErrorHandler((error: FastifyError, request, reply) => {
        if (error instanceof AppError) {
            return reply
                .code(STATUS_BY_CODE[error.code])
                .send({ message: error.message });
        }

        if (hasZodFastifySchemaValidationErrors(error)) {
            const detail = error.validation.map((issue) => issue.message).join("; ");

            return reply
                .code(BAD_REQUEST)
                .send({ message: `Validation error: ${detail}` });
        }

        if (isResponseSerializationError(error)) {
            request.log.error({ err: error }, "response does not match its schema");

            return reply
                .code(INTERNAL_SERVER_ERROR)
                .send({ message: "Internal Server Error" });
        }

        // Errors raised by Fastify itself or its plugins (e.g. 429 from
        // rate-limit, 415 unsupported media type) already carry a status code
        // and a safe message.
        if (
            error.statusCode !== undefined &&
            error.statusCode < INTERNAL_SERVER_ERROR
        ) {
            return reply.code(error.statusCode).send({ message: error.message });
        }

        // Everything else is a bug or an infrastructure failure: log it in
        // full, tell the client nothing.
        request.log.error({ err: error }, error.message);

        return reply
            .code(INTERNAL_SERVER_ERROR)
            .send({ message: "Internal Server Error" });
    });

    fastify.setNotFoundHandler((_request, reply) => {
        return reply.code(404).send({ message: "Route not found." });
    });
};

export default fp(errorHandler, { name: "error-handler" });
