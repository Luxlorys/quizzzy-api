import { z } from "zod";

export const createUserBodySchema = z.object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(100),
});

export const userParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;

export const avatarHeadersSchema = z.object({
    "content-type": z.enum(AVATAR_CONTENT_TYPES),
});

export const userResponseSchema = z.object({
    id: z.number().int(),
    email: z.string(),
    name: z.string(),
    avatarKey: z.string().nullable(),
    onboardedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
