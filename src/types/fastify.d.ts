import type Anthropic from "@anthropic-ai/sdk";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@/generated/prisma/client.js";
import type { AppConfig } from "@/config.js";
import type { ArticlePublicApi } from "@/modules/article/ports/public-api.port.js";
import type { GenerationPublicApi } from "@/modules/generation/ports/public-api.port.js";
import type { QuizPublicApi } from "@/modules/quiz/ports/public-api.port.js";

/**
 * The one place decorations are typed, and the ceiling on what any code in the
 * app can reach through them.
 *
 * Module services are declared as their module's PUBLIC API — the narrow type
 * in its ports/public-api.port.ts — never as the full service type.
 * `decorate()` still accepts the real service (it satisfies the narrower type
 * structurally), but a caller sees only what the module published — so
 * `fastify.articleService.deleteArticle(...)` from an unrelated module is a
 * compile error, not a boundary violation nobody notices.
 *
 * This app-level file may import module types; modules import each other's
 * ports/public-api.port.ts directly and nothing else.
 */
declare module "fastify" {
    interface FastifyInstance {
        config: AppConfig;
        prisma: PrismaClient;
        redis: Redis;
        articleService: ArticlePublicApi;
        quizService: QuizPublicApi;
        generationService: GenerationPublicApi;
        anthropic: Anthropic;
    }
}
