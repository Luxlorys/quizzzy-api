import type { GenerationStatus } from "../generation.entity.js";

export type GenerationRef = {
    id: number;
    status: GenerationStatus;
};

export type GenerationPublicApi = {
    getActiveGeneration: () => Promise<GenerationRef | null>;
};
