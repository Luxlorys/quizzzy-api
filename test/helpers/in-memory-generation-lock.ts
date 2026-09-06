import type { GenerationLock } from "@/modules/generation/ports/lock.port.js";

export const createInMemoryGenerationLock = (): GenerationLock & {
    holderToken: () => string | null;
} => {
    let holder: string | null = null;

    return {
        holderToken: () => holder,

        acquire: async (token) => {
            if (holder !== null) {
                return false;
            }

            holder = token;

            return true;
        },

        renew: async (token) => holder === token,

        release: async (token) => {
            if (holder === token) {
                holder = null;
            }
        },

        holder: async () => holder,
    };
};

export const createBrokenGenerationLock = (): GenerationLock => ({
    acquire: async () => {
        throw new Error("lock store unavailable");
    },
    renew: async () => {
        throw new Error("lock store unavailable");
    },
    release: async () => {
        throw new Error("lock store unavailable");
    },
    holder: async () => {
        throw new Error("lock store unavailable");
    },
});
