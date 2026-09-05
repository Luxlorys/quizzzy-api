import {
    AVATAR_CONTENT_TYPES,
    avatarHeadersSchema,
    createUserBodySchema,
    userParamsSchema,
    userResponseSchema,
} from "./user.schema.js";
import { toCreateUserInput, toSetAvatarInput, toUserResponse } from "./user.dto.js";
import { errorResponseSchema } from "@/lib/schemas.js";
import type { UserService } from "./user.ports.js";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const USER_TAG = "users";

export const userRoutes =
    (service: UserService): FastifyPluginAsyncZod =>
    async (fastify) => {
        fastify.post(
            "/",
            {
                schema: {
                    tags: [USER_TAG],
                    summary: "Create a user",
                    body: createUserBodySchema,
                    response: {
                        201: userResponseSchema,
                        409: errorResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await service.createUser(
                    toCreateUserInput(request.body),
                );

                return reply.code(201).send(toUserResponse(user));
            },
        );

        fastify.get(
            "/:id",
            {
                schema: {
                    tags: [USER_TAG],
                    summary: "Get a user by id",
                    params: userParamsSchema,
                    response: {
                        200: userResponseSchema,
                        404: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const user = await service.getUser(request.params.id);

                return toUserResponse(user);
            },
        );

        fastify.addContentTypeParser(
            [...AVATAR_CONTENT_TYPES],
            { parseAs: "buffer" },
            (_request, body, done) => {
                done(null, body);
            },
        );

        fastify.put(
            "/:id/avatar",
            {
                bodyLimit: 5 * 1024 * 1024,
                schema: {
                    tags: [USER_TAG],
                    summary: "Upload a user's avatar (raw PNG or JPEG body)",
                    consumes: [...AVATAR_CONTENT_TYPES],
                    params: userParamsSchema,
                    headers: avatarHeadersSchema,
                    response: {
                        200: userResponseSchema,
                        404: errorResponseSchema,
                        415: errorResponseSchema,
                        422: errorResponseSchema,
                    },
                },
            },
            async (request) => {
                const body = request.body as Buffer;

                const user = await service.setAvatar(
                    toSetAvatarInput(
                        request.params.id,
                        body,
                        request.headers["content-type"],
                    ),
                );

                return toUserResponse(user);
            },
        );
    };
