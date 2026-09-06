import type { Generation, NewGeneration } from "../generation.entity.js";

export type GenerationRepository = {
    create: (data: NewGeneration) => Promise<Generation>;
    findById: (id: number) => Promise<Generation | null>;
    findActive: () => Promise<Generation | null>;
    save: (generation: Generation) => Promise<Generation>;
    failUnfinished: (
        now: Date,
        exceptLockToken: string | null,
    ) => Promise<Generation[]>;
};
