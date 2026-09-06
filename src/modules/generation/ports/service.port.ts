import type { QuizGenerator } from "./generator.port.js";
import type { GenerationLock } from "./lock.port.js";
import type { GenerationRepository } from "./repository.port.js";
import type { TokenGenerator } from "./tokens.port.js";
import type { GenerationDto, StartGenerationInput } from "../dto/generation.dto.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { QuizPublicApi } from "@/modules/quiz/ports/public-api.port.js";
import type { Clock } from "@/lib/clock.js";

export type GenerationService = {
    startGeneration: (input: StartGenerationInput) => Promise<GenerationDto>;
    getActiveGeneration: () => Promise<GenerationDto | null>;
    getGeneration: (id: number) => Promise<GenerationDto>;
    reconcileOnBoot: () => Promise<void>;
};

export type GenerationServiceDeps = {
    repository: GenerationRepository;
    lock: GenerationLock;
    generator: QuizGenerator;
    articles: ArticlePublicApi;
    quizzes: QuizPublicApi;
    clock: Clock;
    tokens: TokenGenerator;
};

export type GenerationServiceOptions = {
    lockRenewSeconds: number;
};
