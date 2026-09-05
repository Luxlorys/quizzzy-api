import type { AvatarRepository } from "@/modules/user/user.ports.js";

/**
 * A genuine implementation of the AvatarRepository port, not a mock: it stores
 * objects in a Map and mirrors the key contract user.s3.repository.ts honors
 * (a unique key per upload, prefixed by user id).
 */
export const createInMemoryAvatarRepository = (): AvatarRepository & {
    objects: () => Map<string, { body: Buffer; contentType: string }>;
} => {
    let counter = 0;
    const store = new Map<string, { body: Buffer; contentType: string }>();

    return {
        objects: () => new Map(store),

        uploadAvatar: async ({ userId, body, contentType }) => {
            const key = `avatars/${userId}/${counter++}`;

            store.set(key, { body, contentType });

            return key;
        },
    };
};
