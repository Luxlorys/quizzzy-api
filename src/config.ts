import { z } from "zod";

/**
 * The single source of truth for configuration. One validation system (Zod),
 * one derived type (z.infer) — the schema and the type can never drift apart.
 *
 * Config is parsed once at startup and passed into buildApp() as a plain
 * value, so tests can build an app with any config they like.
 */
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    /** How long a cached entity stays readable — the bound on stale data if an
     *  invalidation is ever lost (see modules/quiz/quiz.cache.repository.ts). */
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    DOCS_PASSWORD: z.string().min(1).optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    /** Where submitted article HTML is written (see
     *  modules/article/article.file.repository.ts). */
    ARTICLE_STORAGE_DIR: z.string().min(1).default("storage/articles"),
    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
    ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
    ANTHROPIC_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
    GENERATION_EFFORT: z
        .enum(["low", "medium", "high", "xhigh", "max"])
        .default("high"),
    GENERATION_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(150000),
    GENERATION_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(32000),
    GENERATION_MIN_QUESTIONS: z.coerce.number().int().min(1).max(30).default(5),
    GENERATION_MAX_QUESTIONS: z.coerce.number().int().min(1).max(30).default(30),
    GENERATION_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(90),
    GENERATION_LOCK_RENEW_SECONDS: z.coerce.number().int().positive().default(30),
});

export type AppConfig = z.infer<typeof envSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
    const parsed = envSchema
        .refine(
            (config) =>
                config.GENERATION_LOCK_RENEW_SECONDS * 2 <=
                config.GENERATION_LOCK_TTL_SECONDS,
            {
                message:
                    "GENERATION_LOCK_RENEW_SECONDS must be at most half of GENERATION_LOCK_TTL_SECONDS",
            },
        )
        .refine(
            (config) =>
                config.GENERATION_MIN_QUESTIONS <= config.GENERATION_MAX_QUESTIONS,
            {
                message:
                    "GENERATION_MIN_QUESTIONS must be at most GENERATION_MAX_QUESTIONS",
            },
        )
        .safeParse(env);

    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");

        throw new Error(`Invalid environment configuration — ${issues}`);
    }

    return parsed.data;
};
