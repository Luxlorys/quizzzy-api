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
     *  invalidation is ever lost (see modules/task/task.cache.repository.ts). */
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    DOCS_PASSWORD: z.string().min(1).optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    // Object storage (S3 API). Endpoint is set for S3-compatible servers
    // (MinIO locally and in the integration lane); leave it unset for AWS.
    // Credentials are optional: without them the AWS SDK falls back to its
    // default provider chain (IAM role, shared config, env).
    S3_REGION: z.string().default("us-east-1"),
    S3_AVATARS_BUCKET: z.string().default("avatars"),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
    const parsed = envSchema.safeParse(env);

    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");

        throw new Error(`Invalid environment configuration — ${issues}`);
    }

    return parsed.data;
};
